import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1, CanonicalToolName } from '@voice-agent/contracts';
import {
  DrizzlePostCallReconciliationService,
  DrizzleSchedulingAgentService,
} from '@voice-agent/database';
import {
  bookingTimeline,
  countPhoneSuppressions,
  createBoundCallSession,
  createControlledClock,
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createSyntheticLead,
  createWeekdayCalendar,
  leadStatusOf,
  meetingsOfLead,
  postCallReport,
  setCampaignSchedulingCalendar,
  type DurableOutboundFixture,
} from '@voice-agent/database/test-support';
import { createLeadToolDefinitions } from './lead-agent-tools.js';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import { createSchedulingToolDefinitions } from './scheduling-agent-tools.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import { InMemoryToolRegistry } from './tool-registry.js';

const tdb = await createDisposableTestDatabase('e2-agent-tools');

const TOOLS: CanonicalToolName[] = [
  'scheduling.find_slots',
  'scheduling.request_booking',
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
 * E2 simplificada (DEC-077) — de ponta a ponta, OFFLINE: concessão emitida
 * pelo gateway → motor de ferramentas → serviços canônicos → reconciliação
 * pós-chamada. Substitui a antiga simulação de fala (não há eventos de fala
 * na conexão direta). Sem IA, ligação ou crédito.
 */
describe('E2 simplified: tools through the engine and post-call reconciliation', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });

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
    const registry = new InMemoryToolRegistry();
    const [findSlots, requestBooking] = createSchedulingToolDefinitions(grant, service);
    const [recordOutcome, recordOptOut] = createLeadToolDefinitions(grant, service);
    registry.registerTool(findSlots);
    registry.registerTool(requestBooking);
    registry.registerTool(recordOutcome);
    registry.registerTool(recordOptOut);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(grant),
    });
    const context = buildPublishedVersionToolExecutionContext(grant);
    const call = (toolName: string, rawArguments: unknown) =>
      engine.executeTool({ toolName, rawArguments }, context);
    const attempt = {
      organizationId: tenant.organizationId,
      attemptId: session.attemptId,
      jobId: session.jobId,
      callSessionId: session.sessionId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
    };
    const org = tenant.organizationId;
    return { call, attempt, org, leadId: lead.id, phone: contact.phoneE164 };
  }

  it('find → request is only an intent; the meeting comes from the reconciled history', async () => {
    const s = await setup();
    const found = await s.call('scheduling.find_slots', {});
    expect(found.status).toBe('SUCCESS');
    const offered = (found as { output: { listRevision: number } }).output;
    const requested = await s.call('scheduling.request_booking', {
      listRevision: offered.listRevision,
      option: 1,
      leadConfirmation: 'Sim, pode marcar.',
    });
    expect(requested).toMatchObject({
      status: 'SUCCESS',
      output: { status: 'PENDING_CONFIRMATION' },
    });
    expect(JSON.stringify(requested)).not.toMatch(/marcada|confirmada/i);
    expect(await meetingsOfLead(tdb.db, s.org, s.leadId)).toHaveLength(0);
    const report = postCallReport(bookingTimeline({ listRevision: offered.listRevision }));
    expect((await reports.ingest(s.attempt, report)).status).toBe('RECONCILED');
    expect(await meetingsOfLead(tdb.db, s.org, s.leadId)).toHaveLength(1);
    expect(await leadStatusOf(tdb.db, s.org, s.leadId)).toBe('MEETING_SCHEDULED');
  });

  it('the opt-out tool suppresses at once; the proposed outcome waits for the history', async () => {
    const s = await setup();
    expect(await s.call('lead.record_outcome', { outcome: 'QUALIFIED' })).toMatchObject({
      status: 'SUCCESS',
      output: { status: 'PROPOSED' },
    });
    expect(await leadStatusOf(tdb.db, s.org, s.leadId)).toBe('NEW');
    expect(await s.call('lead.record_opt_out', { leadPhrase: 'Não me ligue mais.' })).toMatchObject(
      {
        status: 'SUCCESS',
        output: { status: 'RECORDED' },
      },
    );
    expect(
      await countPhoneSuppressions(tdb.db, { organizationId: s.org, phoneE164: s.phone }),
    ).toBe(1);
    expect(await leadStatusOf(tdb.db, s.org, s.leadId)).toBe('DO_NOT_CALL');
  });
});
