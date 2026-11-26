import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1, CanonicalToolName } from '@voice-agent/contracts';
import { DrizzleSchedulingAgentService } from '@voice-agent/database';
import {
  advanceSession,
  countPhoneSuppressions,
  createBoundCallSession,
  createControlledClock,
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createSyntheticLead,
  createWeekdayCalendar,
  leadStatusOf,
  leadStatusOrigins,
  meetingsOfLead,
  setCampaignSchedulingCalendar,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { DrizzleCallSessionRepository } from '@voice-agent/database';
import { createLeadToolDefinitions } from './lead-agent-tools.js';
import {
  OfflineCommercialSimulation,
  type SimulationStep,
} from './offline-commercial-simulation.js';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import {
  createSchedulingReplyGuard,
  createSchedulingToolDefinitions,
  schedulingScopeForGrant,
} from './scheduling-agent-tools.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import { InMemoryToolRegistry } from './tool-registry.js';

const tdb = await createDisposableTestDatabase('e2-commercial-simulation');

const TOOLS: CanonicalToolName[] = [
  'scheduling.find_slots',
  'scheduling.confirm_offer',
  'lead.record_outcome',
  'lead.record_opt_out',
];
const snapshot: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'SDR',
    companyName: 'Empresa Exemplo',
    objective: 'Qualificar e agendar uma reunião',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Até logo',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: [], deterministic: {} },
  tools: TOOLS,
};

/**
 * E2 PR 3 (DEC-075) — simulação comercial OFFLINE de ponta a ponta: concessão
 * emitida pelo gateway → sessão durável → motor de ferramentas → serviços
 * canônicos → protocolo persistido → guarda de saída. O "modelo" é um roteiro
 * determinístico: sem IA, ligação ou crédito.
 */
describe('E2 PR3: integrated offline commercial simulation', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup() {
    const tenant = fx.tenantA;
    const grant = await issueTestToolGrant({
      organizationId: tenant.organizationId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      snapshot,
    });
    const { lead, contact } = await createSyntheticLead(tdb.db, tenant.organizationId);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: tenant.organizationId });
    const session = await createBoundCallSession(tdb.db, {
      tenant,
      destinationPhone: contact.phoneE164,
      sessionId: grant.callId,
    });
    await setCampaignSchedulingCalendar(tdb.db, {
      organizationId: tenant.organizationId,
      campaignId: session.campaignId!,
      calendarId: calendar.id,
    });
    const guard = createSchedulingReplyGuard();
    const registry = new InMemoryToolRegistry();
    const [findSlots, confirmOffer] = createSchedulingToolDefinitions(grant, service, guard);
    const [recordOutcome, recordOptOut] = createLeadToolDefinitions(grant, service);
    registry.registerTool(findSlots);
    registry.registerTool(confirmOffer);
    registry.registerTool(recordOutcome);
    registry.registerTool(recordOptOut);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(grant),
    });
    const scope = schedulingScopeForGrant(grant);
    const simulation = new OfflineCommercialSimulation({
      port: service,
      scope,
      engine,
      context: buildPublishedVersionToolExecutionContext(grant),
      guard,
    });
    const orgLead = { organizationId: tenant.organizationId, leadId: lead.id };
    return { simulation, scope, orgLead, phone: contact.phoneE164 };
  }

  const statusOf = (o: { organizationId: string; leadId: string }) =>
    leadStatusOf(tdb.db, o.organizationId, o.leadId);

  it('qualifies, offers, reads back, books, records the outcome and never announces early', async () => {
    const { simulation, orgLead } = await setup();
    const script: SimulationStep[] = [
      { kind: 'model', text: 'Olá! Vocês usam algum sistema de agendamento hoje?' },
      { kind: 'lead', text: 'Não, fazemos tudo por telefone.' },
      { kind: 'tool', toolName: 'lead.record_outcome', args: { outcome: 'QUALIFIED' } },
      { kind: 'model', text: 'Perfeito, já agendei uma reunião para você. Vou ver horários.' },
      { kind: 'tool', toolName: 'scheduling.find_slots', args: {} },
      { kind: 'lead', text: 'A segunda.' },
      { kind: 'lead', text: 'Sim, pode marcar.' },
      { kind: 'model', text: 'Sua reunião está confirmada. Obrigado!' },
    ];
    const result = await simulation.run(script);
    const agentLines = result.transcript.filter((line) => line.speaker === 'AGENT');
    // A frase prematura do modelo ("já agendei") foi descartada; a final passou depois do BOOKED.
    expect(agentLines.map((line) => [line.source, line.text])).toEqual([
      ['MODEL', 'Olá! Vocês usam algum sistema de agendamento hoje?'],
      ['MODEL', 'Vou ver horários.'],
      [
        'SERVER',
        expect.stringContaining('opção 2: segunda-feira, 30 de novembro de 2026, às 09:30'),
      ],
      [
        'SERVER',
        expect.stringContaining(
          'Só para confirmar: segunda-feira, 30 de novembro de 2026, às 09:30',
        ),
      ],
      [
        'SERVER',
        expect.stringContaining(
          'Pronto, a reunião está marcada para segunda-feira, 30 de novembro de 2026, às 09:30',
        ),
      ],
      ['MODEL', 'Sua reunião está confirmada. Obrigado!'],
    ]);
    expect(result.toolResults.map((r) => [r.toolName, r.status])).toEqual([
      ['lead.record_outcome', 'SUCCESS'],
      ['scheduling.find_slots', 'SUCCESS'],
      ['scheduling.confirm_offer', 'SUCCESS'],
    ]);
    const meetings = await meetingsOfLead(tdb.db, orgLead.organizationId, orgLead.leadId);
    expect(meetings.map((m) => [m.status, m.startsAt.toISOString(), m.bookedByType])).toEqual([
      ['SCHEDULED', '2026-11-30T12:30:00.000Z', 'AGENT'],
    ]);
    expect(await statusOf(orgLead)).toBe('MEETING_SCHEDULED');
    const origins = await leadStatusOrigins(tdb.db, orgLead.organizationId, orgLead.leadId);
    expect(origins).toEqual(
      expect.arrayContaining([
        { origin: 'CALL_OUTCOME', to: 'QUALIFIED' },
        { origin: 'MEETING_BOOKED', to: 'MEETING_SCHEDULED' },
      ]),
    );
  });

  it('a spoken opt-out mid-flow is recorded by the server and stops the commercial approach', async () => {
    const { simulation, orgLead, phone, scope } = await setup();
    const result = await simulation.run([
      { kind: 'tool', toolName: 'scheduling.find_slots', args: {} },
      { kind: 'lead', text: 'Não me ligue mais.' },
      { kind: 'tool', toolName: 'scheduling.find_slots', args: { day: '2026-12-01' } },
      { kind: 'tool', toolName: 'lead.record_outcome', args: { outcome: 'QUALIFIED' } },
      { kind: 'model', text: 'Marquei uma reunião para amanhã.' },
    ]);
    expect(result.transcript.at(-1)?.text).toBe(
      'Tudo bem, não vamos mais seguir com o agendamento.',
    );
    expect(result.transcript.some((line) => line.text.includes('Registrei o seu pedido'))).toBe(
      true,
    );
    expect(
      result.toolResults
        .slice(1)
        .map((r) => (r.status === 'SUCCESS' ? (r.output as { status: string }).status : r.status)),
    ).toEqual(['REFUSED', 'REFUSED']);
    expect(
      await countPhoneSuppressions(tdb.db, {
        organizationId: scope.organizationId,
        phoneE164: phone,
      }),
    ).toBe(1);
    expect(await statusOf(orgLead)).toBe('DO_NOT_CALL');
    expect(await meetingsOfLead(tdb.db, orgLead.organizationId, orgLead.leadId)).toHaveLength(0);
  });

  it('a possible opt-out interrupts the approach until a reliable answer; "sim" records it', async () => {
    const { simulation, orgLead, phone, scope } = await setup();
    const result = await simulation.run([
      { kind: 'tool', toolName: 'scheduling.find_slots', args: {} },
      { kind: 'lead', text: 'A primeira.' },
      { kind: 'lead', text: 'Tire meu número da lista, mas só se eu confirmar amanhã.' },
      { kind: 'lead', text: 'Sim, pode marcar.' },
      { kind: 'lead', text: 'Sim.' },
    ]);
    const questions = result.transcript.filter((line) =>
      line.text.includes('pare de ligar para você?'),
    );
    expect(questions.length).toBe(2);
    expect(result.toolResults.map((r) => r.toolName)).toEqual(['scheduling.find_slots']);
    expect(
      await countPhoneSuppressions(tdb.db, {
        organizationId: scope.organizationId,
        phoneE164: phone,
      }),
    ).toBe(1);
    expect(await meetingsOfLead(tdb.db, orgLead.organizationId, orgLead.leadId)).toHaveLength(0);
  });

  it('a clear "não" resumes with a fresh list; the earlier consent is never reused', async () => {
    const { simulation, orgLead } = await setup();
    const result = await simulation.run([
      { kind: 'tool', toolName: 'scheduling.find_slots', args: {} },
      { kind: 'lead', text: 'A primeira.' },
      { kind: 'lead', text: 'Me descadastre, só que não.' },
      { kind: 'lead', text: 'Não.' },
      { kind: 'lead', text: 'A terceira.' },
      { kind: 'lead', text: 'Isso mesmo.' },
    ]);
    expect(result.toolResults.map((r) => r.toolName)).toEqual([
      'scheduling.find_slots',
      'scheduling.find_slots',
      'scheduling.confirm_offer',
    ]);
    const meetings = await meetingsOfLead(tdb.db, orgLead.organizationId, orgLead.leadId);
    expect(meetings.map((m) => m.startsAt.toISOString())).toEqual(['2026-11-30T13:00:00.000Z']);
  });

  it('after the session ends nothing new is recorded and nothing is announced', async () => {
    const { simulation, orgLead, phone, scope } = await setup();
    await simulation.run([
      { kind: 'tool', toolName: 'scheduling.find_slots', args: {} },
      { kind: 'lead', text: 'A primeira.' },
    ]);
    await advanceSession(new DrizzleCallSessionRepository(tdb.db), scope, 'ENDED');
    const result = await simulation.run([
      { kind: 'lead', text: 'Sim, pode marcar.' },
      { kind: 'lead', text: 'Não me ligue mais.' },
      { kind: 'tool', toolName: 'scheduling.confirm_offer', args: {} },
      { kind: 'model', text: 'Pronto, reunião agendada.' },
    ]);
    expect(result.transcript.filter((line) => line.source === 'MODEL')).toEqual([]);
    expect(await meetingsOfLead(tdb.db, orgLead.organizationId, orgLead.leadId)).toHaveLength(0);
    expect(
      await countPhoneSuppressions(tdb.db, {
        organizationId: scope.organizationId,
        phoneE164: phone,
      }),
    ).toBe(0);
  });
});
