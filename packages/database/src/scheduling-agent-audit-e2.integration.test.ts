import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SchedulingAgentScope } from '@voice-agent/contracts';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleMeetingCancellationService } from './repositories/meeting-cancellation-service.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { leadStatusChanges } from './schema/lead-status-changes.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createAgentScenario,
  leadStatusOf,
  meetingsOfLead,
  SchedulingHarness,
  type AgentScenario,
} from './test-support/scheduling-agent-harness.js';
import {
  countPhoneSuppressions,
  createControlledClock,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-consolidated-audit');

/**
 * Auditoria consolidada da E2 (Codex: BLOQUEADA) — cenários exatos A1–A7 e a
 * integridade da 0017, com efeitos PERSISTIDOS conferidos no banco.
 */
describe('E2 consolidated audit — server-side findings', () => {
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
    clock.set(SCHEDULING_TEST_NOW);
    const scenario = await createAgentScenario(tdb.db, { fx });
    return { ...scenario, harness: new SchedulingHarness(service, scenario.scope) };
  }
  const suppressions = (s: AgentScenario) =>
    countPhoneSuppressions(tdb.db, { organizationId: s.scope.organizationId, phoneE164: s.phone });
  const meetings = (s: AgentScenario) => meetingsOfLead(tdb.db, s.scope.organizationId, s.leadId);
  const history = (s: AgentScenario) =>
    tdb.db.select().from(leadStatusChanges).where(eq(leadStatusChanges.leadId, s.leadId));
  /** Início e fim de fala do MESMO turno do transporte. */
  const turn = async (scope: SchedulingAgentScope, text: string, turnId = randomUUID()) => {
    await service.recordLeadSpeechStarted(scope, { turnId });
    return service.recordLeadUtterance(scope, { turnId, text });
  };

  it('A1: another agent utterance between the readback and the answer voids the confirmation', async () => {
    const s = await setup();
    const { revision } = await s.harness.reachConfirmation();
    const generationId = `model-${randomUUID()}`;
    await service.recordSpeech(s.scope, { type: 'SPEECH_STARTED', generationId, purpose: 'AGENT' });
    await service.recordSpeech(s.scope, { type: 'SPEECH_COMPLETED', generationId });
    const answer = await turn(s.scope, 'Sim.');
    expect(answer.directives.map((d) => d.kind)).not.toContain('BOOK');
    expect(await service.confirmOffer(s.scope)).toMatchObject({ reason: 'NOT_AUTHORIZED' });
    expect(await meetings(s)).toHaveLength(0);
    expect(revision).toBeGreaterThan(0);
  });

  it('A1: a stale or duplicate final of another turn never authorizes', async () => {
    const s = await setup();
    await s.harness.reachConfirmation();
    const earlier = randomUUID();
    await service.recordLeadSpeechStarted(s.scope, { turnId: randomUUID() });
    const stale = await service.recordLeadUtterance(s.scope, { turnId: earlier, text: 'Sim.' });
    expect(stale.ignored).toBe('TURN_MISMATCH');
    const fresh = randomUUID();
    await service.recordLeadSpeechStarted(s.scope, { turnId: fresh });
    await service.recordLeadUtterance(s.scope, { turnId: fresh, text: 'A terceira.' });
    const duplicate = await service.recordLeadUtterance(s.scope, { turnId: fresh, text: 'Sim.' });
    expect(duplicate.ignored).toBe('DUPLICATE_FINAL');
    expect(await service.confirmOffer(s.scope)).toMatchObject({ reason: 'NOT_AUTHORIZED' });
    expect(await meetings(s)).toHaveLength(0);
  });

  it('A2: the opt-out tool never suppresses without a server-recognized request', async () => {
    const s = await setup();
    expect(await service.recordOptOut(s.scope)).toMatchObject({
      status: 'REFUSED',
      reason: 'NO_OPT_OUT_EVIDENCE',
    });
    expect(await suppressions(s)).toBe(0);
    expect(await leadStatusOf(tdb.db, s.scope.organizationId, s.leadId)).toBe('NEW');
  });

  it('A3: a possible opt-out in IDLE asks for clarification and allows nothing else', async () => {
    const s = await setup();
    const view = await turn(s.scope, 'Se eu mudar de ideia, vou pedir para tirar meu número.');
    expect(view).toMatchObject({ phase: 'IDLE', optOutClarificationPending: true });
    expect(view.directives.map((d) => d.kind)).toEqual(['ASK_CLARIFICATION']);
    expect(await service.authorizeOutput(s.scope, { kind: 'MODEL_TEXT' })).toMatchObject({
      allowed: false,
    });
    expect(await service.authorizeOutput(s.scope, { kind: 'OPT_OUT_QUESTION' })).toMatchObject({
      allowed: true,
    });
  });

  it('A3/A6: after the opt-out, a booking replay is refused and never announced (meeting kept)', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    expect(await service.confirmOffer(s.scope)).toMatchObject({ status: 'BOOKED' });
    await turn(s.scope, 'Me descadastre.');
    expect(await service.confirmOffer(s.scope)).toMatchObject({
      status: 'REFUSED',
      reason: 'OPT_OUT_REQUESTED',
      mayAnnounceBooking: false,
    });
    expect((await meetings(s))[0]?.status).toBe('SCHEDULED');
  });

  it('A4: a late completion after an interruption never restores the question', async () => {
    const s = await setup();
    await turn(s.scope, 'Tire meu número da lista, mas só se eu confirmar amanhã.');
    await service.recordSpeech(s.scope, {
      type: 'SPEECH_STARTED',
      generationId: 'q',
      purpose: 'OPT_OUT_QUESTION',
    });
    await service.recordSpeech(s.scope, { type: 'SPEECH_INTERRUPTED', generationId: 'q' });
    await service.recordSpeech(s.scope, { type: 'SPEECH_COMPLETED', generationId: 'q' });
    expect((await turn(s.scope, 'Sim.')).optOutClarificationPending).toBe(true);
    expect(await suppressions(s)).toBe(0);
  });

  it('A4: an over-long answer never decides from its truncated prefix', async () => {
    const s = await setup();
    await turn(s.scope, 'Tire meu número da lista, mas só se eu confirmar amanhã.');
    await service.recordSpeech(s.scope, {
      type: 'SPEECH_STARTED',
      generationId: 'q2',
      purpose: 'OPT_OUT_QUESTION',
    });
    await service.recordSpeech(s.scope, { type: 'SPEECH_COMPLETED', generationId: 'q2' });
    const view = await turn(s.scope, `Sim${' '.repeat(4_100)}não, pode continuar ligando.`);
    expect(view.optOutClarificationPending).toBe(true);
    expect(await suppressions(s)).toBe(0);
    const fresh = await setup();
    const long = await turn(fresh.scope, `Sim${' '.repeat(4_100)}mas me tira da lista.`);
    expect(long.optOutClarificationPending).toBe(true);
  });

  it('A5: UNKNOWN with rollback, then a new empty query, then the old confirmation: zero meetings', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    let calls = 0;
    const flaky = new DrizzleSchedulingAgentService(tdb.db, {
      clock: () => {
        calls += 1;
        if (calls === 4) throw new Error('injected failure at the final guard');
        return clock.now();
      },
    });
    expect(await flaky.confirmOffer(s.scope)).toMatchObject({ status: 'UNKNOWN' });
    expect(await service.findSlots(s.scope, { day: '2026-12-06' })).toMatchObject({
      status: 'NO_AVAILABILITY',
    });
    expect(await service.confirmOffer(s.scope)).toMatchObject({ reason: 'NOT_AUTHORIZED' });
    expect(await meetings(s)).toHaveLength(0);
  });

  it('A5: an external suppression between the offer and the retry is honored', async () => {
    const s = await setup();
    expect(await service.findSlots(s.scope, {})).toMatchObject({ status: 'OFFERED' });
    await new DrizzleContactSuppressionRepository(tdb.db).addSuppression({
      organizationId: s.scope.organizationId,
      phoneE164: s.phone,
      reason: 'OPT_OUT',
    });
    expect(await service.findSlots(s.scope, {})).toMatchObject({
      status: 'REFUSED',
      reason: 'LEAD_NOT_BOOKABLE',
    });
  });

  it('A6: no booking claim from a historical BOOKED phase after cancellation', async () => {
    const s = await setup();
    await s.harness.reachAuthorization();
    expect(await service.confirmOffer(s.scope)).toMatchObject({ status: 'BOOKED' });
    const [meeting] = await meetings(s);
    const canceled = await new DrizzleMeetingCancellationService(tdb.db).cancelMeeting({
      organizationId: s.scope.organizationId,
      meetingId: meeting!.id,
      expectedVersion: meeting!.version,
      actor: SCHEDULING_TEST_USER,
      now: SCHEDULING_TEST_NOW,
    });
    expect(canceled.kind).toBe('CANCELED');
    const replay = await service.confirmOffer(s.scope);
    expect(replay).toMatchObject({ mayAnnounceBooking: false });
    expect(replay.speech).not.toMatch(/marcad|confirmad/u);
    const found = await service.findSlots(s.scope, {});
    expect(found.speech).not.toMatch(/marcad/u);
    expect(await service.authorizeOutput(s.scope, { kind: 'BOOKING_RESULT' })).toMatchObject({
      allowed: false,
    });
  });

  it('A6: output authority — only the server announces, from the meeting verified now', async () => {
    const s = await setup();
    const { revision } = await s.harness.reachConfirmation();
    const out = (output: Parameters<typeof service.authorizeOutput>[1]) =>
      service.authorizeOutput(s.scope, output);
    expect(await out({ kind: 'MODEL_TEXT' })).toMatchObject({ allowed: false });
    expect(await out({ kind: 'PRESENTATION', listRevision: revision })).toMatchObject({
      allowed: false,
    });
    expect(await out({ kind: 'BOOKING_RESULT' })).toMatchObject({ allowed: false });
    expect(await out({ kind: 'OPT_OUT_CONFIRMATION' })).toMatchObject({ allowed: false });
    await turn(s.scope, 'Sim.');
    const booked = await service.confirmOffer(s.scope);
    expect(booked).toMatchObject({ status: 'BOOKED' });
    expect(await meetings(s)).toHaveLength(1);
    expect(await out({ kind: 'BOOKING_RESULT' })).toEqual({
      allowed: true,
      speech: booked.speech,
    });
    expect(await out({ kind: 'MODEL_TEXT' })).toMatchObject({ allowed: false });
    await turn(s.scope, 'Não me ligue mais.');
    expect(await out({ kind: 'BOOKING_RESULT' })).toMatchObject({
      allowed: false,
    });
    expect(await out({ kind: 'OPT_OUT_CONFIRMATION' })).toMatchObject({ allowed: true });
    expect(await out({ kind: 'NOTICE' })).toMatchObject({ allowed: false });
  });

  it('0017 legacy: OPTED_OUT without suppression stays blocked, is not auto-suppressed, and the tool recovers it', async () => {
    const s = await setup();
    await turn(s.scope, 'Oi.');
    // Estado legado: fase OPTED_OUT com evidência do protocolo, sem registro canônico.
    await tdb.db.execute(sql`UPDATE scheduling_protocol_states
      SET state = state || '{"phase":"OPTED_OUT","optOutSeq":1}'::jsonb
      WHERE organization_id = ${s.scope.organizationId} AND session_id = ${s.sessionId}`);
    expect(await service.findSlots(s.scope, {})).toMatchObject({ status: 'REFUSED' });
    expect((await turn(s.scope, 'A primeira.')).directives).toEqual([]);
    expect(await service.authorizeOutput(s.scope, { kind: 'MODEL_TEXT' })).toMatchObject({
      allowed: false,
    });
    expect(await suppressions(s)).toBe(0);
    expect(await service.recordOptOut(s.scope)).toMatchObject({ status: 'RECORDED' });
    expect(await suppressions(s)).toBe(1);
    const source = await tdb.db
      .execute(sql`SELECT opt_out_source AS s FROM scheduling_protocol_states
      WHERE organization_id = ${s.scope.organizationId} AND session_id = ${s.sessionId}`);
    expect(source.rows[0]?.s).toBe('RECOVERY');
    expect(await leadStatusOf(tdb.db, s.scope.organizationId, s.leadId)).toBe('DO_NOT_CALL');
  });

  it('A7: no call outcome without trusted interlocution; status and history unchanged', async () => {
    const s = await setup();
    const before = await history(s);
    expect(await service.recordOutcome(s.scope, { outcome: 'NOT_INTERESTED' })).toMatchObject({
      status: 'REFUSED',
      reason: 'NO_INTERLOCUTION',
    });
    expect(await leadStatusOf(tdb.db, s.scope.organizationId, s.leadId)).toBe('NEW');
    expect(await history(s)).toEqual(before);
    await turn(s.scope, 'Não temos interesse.');
    expect(await service.recordOutcome(s.scope, { outcome: 'NOT_INTERESTED' })).toMatchObject({
      status: 'RECORDED',
    });
  });

  it('0017: recorded opt-out requires a known source (no NULL loophole)', async () => {
    const s = await setup();
    await turn(s.scope, 'Oi.');
    await expect(
      tdb.db
        .execute(sql`UPDATE scheduling_protocol_states SET opt_out_recorded_at = now(), opt_out_source = NULL
        WHERE organization_id = ${s.scope.organizationId} AND session_id = ${s.sessionId}`),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
