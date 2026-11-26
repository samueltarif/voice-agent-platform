import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { readProtocolRow } from './repositories/scheduling-agent-scope.js';
import { leadStatusChanges } from './schema/lead-status-changes.js';
import { leads } from './schema/leads.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createAgentScenario,
  meetingsOfLead,
  SchedulingHarness,
  type AgentScenario,
} from './test-support/scheduling-agent-harness.js';
import {
  countPhoneSuppressions,
  createControlledClock,
  SCHEDULING_TEST_NOW,
} from './test-support/scheduling-fixtures.js';
import {
  createSchedulingLockProbe,
  type SchedulingLockProbe,
} from './test-support/scheduling-lock-probe.js';
import { advanceSession } from './test-support/scheduling-session-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-agent-opt-out');

/**
 * E2 PR 3 (DEC-075, D2/D5) — opt-out canônico gravado pelo servidor,
 * esclarecimento de possível opt-out, resultado comercial e as corridas com a
 * reserva, sobre PostgreSQL descartável e serviços reais.
 */
describe('E2 PR3: canonical opt-out, clarification and call outcome', () => {
  let fx: DurableOutboundFixture;
  let probe: SchedulingLockProbe | null = null;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterEach(async () => {
    await probe?.close();
    probe = null;
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup(options: { calendarId?: null } = {}) {
    clock.set(SCHEDULING_TEST_NOW);
    const scenario = await createAgentScenario(tdb.db, { fx, ...options });
    return { ...scenario, harness: new SchedulingHarness(service, scenario.scope) };
  }
  const suppressions = (s: AgentScenario) =>
    countPhoneSuppressions(tdb.db, { organizationId: s.scope.organizationId, phoneE164: s.phone });
  const leadStatus = async (s: AgentScenario) =>
    (
      await tdb.db
        .select({ status: leads.status })
        .from(leads)
        .where(and(eq(leads.id, s.leadId), eq(leads.organizationId, s.scope.organizationId)))
    )[0]?.status;

  it('a spoken opt-out is written to the canonical suppression without any tool', async () => {
    const s = await setup();
    const view = await s.harness.leadSays('Não me ligue mais.');
    expect(view).toMatchObject({ phase: 'OPTED_OUT' });
    expect(view.speech).toContain('não vamos mais ligar');
    expect(await suppressions(s)).toBe(1);
    expect(await leadStatus(s)).toBe('DO_NOT_CALL');
    expect((await readProtocolRow(tdb.db, s.scope))?.optOutSource).toBe('LEAD_UTTERANCE');
    expect(await service.findSlots(s.scope, {})).toMatchObject({ reason: 'OPT_OUT_REQUESTED' });
    expect(await service.recordOutcome(s.scope, { outcome: 'QUALIFIED' })).toMatchObject({
      reason: 'OPT_OUT_REQUESTED',
    });
  });

  it('suppresses the dialed phone even without a lead or a calendar', async () => {
    const s = await setup({ calendarId: null });
    await tdb.db.delete(leadStatusChanges).where(eq(leadStatusChanges.leadId, s.leadId));
    await tdb.db.delete(leads).where(eq(leads.id, s.leadId));
    expect((await s.harness.leadSays('Me descadastre.')).phase).toBe('OPTED_OUT');
    expect(await suppressions(s)).toBe(1);
  });

  it('the clarification only counts an answer that started after the question was delivered', async () => {
    const s = await setup();
    await s.harness.reachConfirmation();
    const asked = await s.harness.leadSays(
      'Tire meu número da lista, mas só se eu confirmar amanhã.',
    );
    expect(asked.optOutClarificationPending).toBe(true);
    // Resposta antes da pergunta ser falada: não vale.
    expect((await s.harness.leadSays('Sim.')).optOutClarificationPending).toBe(true);
    const generationId = 'q-1';
    await service.recordSpeech(s.scope, {
      type: 'SPEECH_STARTED',
      generationId,
      purpose: 'OPT_OUT_QUESTION',
    });
    await service.recordSpeech(s.scope, { type: 'SPEECH_INTERRUPTED', generationId });
    expect((await s.harness.leadSays('Sim.')).optOutClarificationPending).toBe(true);
    expect(await suppressions(s)).toBe(0);
    await service.recordSpeech(s.scope, {
      type: 'SPEECH_STARTED',
      generationId: 'q-2',
      purpose: 'OPT_OUT_QUESTION',
    });
    await service.recordSpeech(s.scope, { type: 'SPEECH_COMPLETED', generationId: 'q-2' });
    expect((await s.harness.leadSays('Sim.')).phase).toBe('OPTED_OUT');
    expect(await suppressions(s)).toBe(1);
    expect((await readProtocolRow(tdb.db, s.scope))?.optOutSource).toBe('CLARIFICATION');
  });

  it('a clear "no" resumes with a NEW list; anything else keeps the block', async () => {
    const s = await setup();
    await s.harness.reachConfirmation();
    await s.harness.leadSays('Ela disse: “Não me ligue mais.”');
    const ask = async (id: string) => {
      await service.recordSpeech(s.scope, {
        type: 'SPEECH_STARTED',
        generationId: id,
        purpose: 'OPT_OUT_QUESTION',
      });
      await service.recordSpeech(s.scope, { type: 'SPEECH_COMPLETED', generationId: id });
    };
    for (const unclear of ['Talvez.', 'Sim, pode marcar.', 'Não, obrigado.', 'A segunda.']) {
      await ask(`q-${unclear}`);
      expect([unclear, (await s.harness.leadSays(unclear)).optOutClarificationPending]).toEqual([
        unclear,
        true,
      ]);
    }
    expect(await service.confirmOffer(s.scope)).toMatchObject({
      reason: 'OPT_OUT_CLARIFICATION_PENDING',
    });
    await ask('q-final');
    const resumed = await s.harness.leadSays('Não.');
    expect(resumed).toMatchObject({ optOutClarificationPending: false, phase: 'IDLE' });
    expect(resumed.directives.map((d) => d.kind)).toEqual(['REQUEST_NEW_LIST']);
    expect(await suppressions(s)).toBe(0);
    expect(await service.findSlots(s.scope, {})).toMatchObject({ status: 'OFFERED' });
  });

  it('records the call outcome under D5 and never reopens DO_NOT_CALL or touches a meeting', async () => {
    const s = await setup();
    expect(await service.recordOutcome(s.scope, { outcome: 'CONTACTED' })).toEqual({
      status: 'RECORDED',
      outcome: 'CONTACTED',
    });
    expect(await service.recordOutcome(s.scope, { outcome: 'QUALIFIED' })).toEqual({
      status: 'RECORDED',
      outcome: 'QUALIFIED',
    });
    expect(await service.recordOutcome(s.scope, { outcome: 'QUALIFIED' })).toEqual({
      status: 'ALREADY_RECORDED',
      outcome: 'QUALIFIED',
    });
    expect(await service.recordOutcome(s.scope, { outcome: 'CONTACTED' })).toMatchObject({
      reason: 'TRANSITION_NOT_ALLOWED',
    });
    const history = await tdb.db
      .select()
      .from(leadStatusChanges)
      .where(eq(leadStatusChanges.leadId, s.leadId));
    expect(
      history
        .filter((row) => row.origin === 'CALL_OUTCOME')
        .map((row) => [row.toStatus, row.actorType]),
    ).toEqual([
      ['CONTACTED', 'AGENT'],
      ['QUALIFIED', 'AGENT'],
    ]);
    await s.harness.reachAuthorization();
    expect(await service.confirmOffer(s.scope)).toMatchObject({ status: 'BOOKED' });
    expect(await service.recordOutcome(s.scope, { outcome: 'NOT_INTERESTED' })).toMatchObject({
      reason: 'MEETING_PRESERVED',
    });
    expect(await leadStatus(s)).toBe('MEETING_SCHEDULED');
  });

  it('the opt-out tool is idempotent, preserves an existing meeting and refuses a closed session', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    expect(await service.confirmOffer(s.scope)).toMatchObject({ status: 'BOOKED' });
    expect(await service.recordOptOut(s.scope)).toMatchObject({
      status: 'RECORDED',
      meetingPreserved: true,
    });
    expect(await service.recordOptOut(s.scope)).toMatchObject({
      status: 'RECORDED',
      meetingPreserved: true,
    });
    expect(await suppressions(s)).toBe(1);
    expect(await leadStatus(s)).toBe('MEETING_SCHEDULED');
    expect((await meetingsOfLead(tdb.db, s.scope.organizationId, s.leadId))[0]?.status).toBe(
      'SCHEDULED',
    );
    const closed = await setup();
    await advanceSession(new DrizzleCallSessionRepository(tdb.db), closed.scope, 'ENDED');
    expect(await service.recordOptOut(closed.scope)).toMatchObject({
      status: 'REFUSED',
      reason: 'SESSION_NOT_ACTIVE',
    });
    expect((await closed.harness.leadSays('Não me ligue mais.')).refusal).toBe(
      'SESSION_NOT_ACTIVE',
    );
    expect(await suppressions(closed)).toBe(0);
  });

  /** Segura o lead (L); a 1ª operação espera a sonda, a 2ª espera a 1ª. */
  async function race(
    s: AgentScenario & { harness: SchedulingHarness },
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
  ) {
    probe = await createSchedulingLockProbe(tdb.url);
    await probe.holdInTransaction('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [s.leadId]);
    const a = first();
    const [firstPid] = await probe.waitForSessionsBlockedBy(probe.pid, 1);
    const b = second();
    await probe.waitForSessionsBlockedBy(firstPid!, 1);
    await probe.commit();
    return Promise.all([a, b]);
  }

  it('booking wins the race: the meeting is kept and the phone is still suppressed', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    await service.recordLeadSpeechStarted(s.scope);
    const [booked, optedOut] = await race(
      s,
      () => service.confirmOffer(s.scope),
      () => service.recordLeadUtterance(s.scope, 'Não me ligue mais.'),
    );
    expect(booked).toMatchObject({ status: 'BOOKED' });
    expect(optedOut).toMatchObject({ phase: 'OPTED_OUT' });
    expect(await leadStatus(s)).toBe('MEETING_SCHEDULED');
    expect(await suppressions(s)).toBe(1);
  });

  it('opt-out wins the race: the booking is refused and nothing is announced', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    await service.recordLeadSpeechStarted(s.scope);
    const [optedOut, booked] = await race(
      s,
      () => service.recordLeadUtterance(s.scope, 'Não me ligue mais.'),
      () => service.confirmOffer(s.scope),
    );
    expect(optedOut).toMatchObject({ phase: 'OPTED_OUT' });
    expect(booked).toMatchObject({
      status: 'REFUSED',
      reason: 'OPT_OUT_REQUESTED',
      mayAnnounceBooking: false,
    });
    expect(await meetingsOfLead(tdb.db, s.scope.organizationId, s.leadId)).toHaveLength(0);
    expect(await leadStatus(s)).toBe('DO_NOT_CALL');
  });

  it('isolation: a forged scope never records outcomes or opt-outs', async () => {
    const s = await setup();
    const forged = { ...s.scope, organizationId: fx.tenantB.organizationId };
    expect(await service.recordOutcome(forged, { outcome: 'NOT_INTERESTED' })).toMatchObject({
      reason: 'CONTEXT_REFUSED',
    });
    expect(await service.recordOptOut(forged)).toMatchObject({ reason: 'CONTEXT_REFUSED' });
    expect(await suppressions(s)).toBe(0);
    expect(await leadStatus(s)).toBe('NEW');
  });

  it('after a tool opt-out, later utterances never resume the commercial approach', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    await s.harness.speak({ purpose: 'PRESENTATION', listRevision: found.listRevision });
    expect(await service.recordOptOut(s.scope)).toMatchObject({
      status: 'RECORDED',
      meetingPreserved: false,
    });
    const view = await s.harness.leadSays('A primeira.');
    expect(view).toMatchObject({ directives: [], refusal: 'OPT_OUT_REQUESTED' });
    expect(await service.confirmOffer(s.scope)).toMatchObject({ reason: 'OPT_OUT_REQUESTED' });
    expect(await leadStatus(s)).toBe('DO_NOT_CALL');
  });
});
