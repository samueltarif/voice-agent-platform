import { evaluatePostCallReport, type PostCallEntry } from '@voice-agent/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { applyPostCallBooking } from './repositories/post-call-effects.js';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { recordReport } from './repositories/post-call-record.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { closeAttempt, stateOf } from './test-support/post-call-audit-support.js';
import { bookingTimeline } from './test-support/post-call-timelines.js';
import {
  createAgentScenario,
  intentsOf,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-audit184-booking');

/**
 * Auditoria Codex da PR #184 — A1, A2, A4 e A6, reproduzidos com o estado
 * conjunto: reunião, intenção, motivo de revisão, supressão, histórico
 * comercial e o resultado do próximo claim ao mesmo telefone.
 */
describe('audit #184: acceptance, retries, partial failure, conflicts and late tools', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });
  const deps = {
    db: tdb.db,
    clock: clock.now,
    bookings: new DrizzleMeetingBookingService(tdb.db, clock.now),
  };

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup() {
    clock.set(SCHEDULING_TEST_NOW);
    const s = await createAgentScenario(tdb.db, { fx });
    return {
      ...s,
      attempt: await postCallAttemptOf(tdb.db, s),
      state: () => stateOf(tdb.db, s),
      endCall: () =>
        closeAttempt(tdb.db, { organizationId: s.scope.organizationId, attemptId: s.attemptId }),
    };
  }

  const request = (option: number, listRevision: number): PostCallEntry => ({
    kind: 'TOOL_CALL',
    toolName: 'scheduling.request_booking',
    arguments: { listRevision, option, leadConfirmation: 'Sim.' },
  });

  it('A1: "Confirma segunda às 9:30?" + "Sim" never books the 09:00 intent', async () => {
    for (const readback of [
      'Confirma segunda às 9:30?',
      'Segunda às 9h está indisponível. Posso consultar terça?',
    ]) {
      const s = await setup();
      const { listRevision } = await offerAndRequest(service, s.scope); // opção 1 = 09:00
      await s.endCall();
      const report = postCallReport(bookingTimeline({ listRevision, readback, reply: 'Sim.' }));
      expect(await reports.ingest(s.attempt, report)).toEqual({
        status: 'NEEDS_REVIEW',
        reasons: ['BOOKING_READBACK_NOT_EVIDENT'],
      });
      expect([readback, await s.state()]).toEqual([
        readback,
        {
          meetings: 0,
          intents: ['NEEDS_REVIEW:READBACK_NOT_EVIDENT'],
          reconciliation: { status: 'NEEDS_REVIEW', reasons: ['BOOKING_READBACK_NOT_EVIDENT'] },
          suppressions: 0,
          commercial: ['CREATED:NEW'],
          nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
        },
      ]);
    }
  });

  it('A2: a re-delivered older request never replaces the latest choice', async () => {
    const s = await setup();
    const first = await offerAndRequest(service, s.scope, { option: 1 });
    const args = (option: number) => ({
      listRevision: first.listRevision,
      option,
      leadConfirmation: 'Sim.',
    });
    expect((await service.requestBooking(s.scope, args(2))).status).toBe('PENDING_CONFIRMATION');
    expect((await service.requestBooking(s.scope, args(2))).status).toBe('PENDING_CONFIRMATION');
    expect((await intentsOf(tdb.db, s.scope)).map((i) => [i.option, i.status])).toEqual([
      [1, 'SUPERSEDED'],
      [2, 'PENDING_EVIDENCE'],
    ]);
    // Reentrega técnica do 1º pedido: ambígua (sem id de invocação comprovado) ⇒ revisão.
    // Reauditoria A2: a resposta corresponde ao estado persistido (nenhuma intenção nova).
    const underReview = { status: 'REFUSED', reason: 'REQUEST_UNDER_REVIEW' };
    expect(await service.requestBooking(s.scope, args(1))).toMatchObject(underReview);
    expect(await service.requestBooking(s.scope, args(3))).toMatchObject(underReview);
    await s.endCall();
    const readback2 = { kind: 'AGENT' as const, text: 'Confirma segunda às 9h30?' };
    const entries = [
      ...bookingTimeline({ listRevision: first.listRevision }),
      readback2,
      { kind: 'LEAD' as const, text: 'Sim.' },
      request(2, first.listRevision),
    ];
    const result = await reports.ingest(s.attempt, postCallReport(entries));
    expect(result).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['BOOKING_REQUEST_ORDER_AMBIGUOUS'],
    });
    expect(await s.state()).toEqual({
      meetings: 0,
      intents: ['SUPERSEDED:NEW_REQUEST', 'NEEDS_REVIEW:REQUEST_ORDER_AMBIGUOUS'],
      reconciliation: { status: 'NEEDS_REVIEW', reasons: ['BOOKING_REQUEST_ORDER_AMBIGUOUS'] },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('A2: the history’s last booking request must be the surviving intent', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope, { option: 1 });
    await s.endCall();
    const after = [
      { kind: 'AGENT' as const, text: 'Confirma segunda às 9h30?' },
      { kind: 'LEAD' as const, text: 'Sim.' },
      request(2, listRevision), // pedido que a VAP nunca recebeu
    ];
    const result = await reports.ingest(
      s.attempt,
      postCallReport(bookingTimeline({ listRevision, after })),
    );
    expect(result.reasons).toEqual(['BOOKING_LAST_REQUEST_MISMATCH']);
    expect((await s.state()).meetings).toBe(0);
  });

  it('A4: a decision persisted before a crash survives the re-delivery of the same report', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    await s.endCall();
    const report = postCallReport(bookingTimeline({ listRevision, reply: 'Talvez, vou ver.' }));
    // 1ª entrega: registro + efeito persistido; o processo "cai" antes do fechamento.
    const step = await recordReport(tdb.db, { attempt: s.attempt, report, now: clock.now() });
    if (step.kind !== 'PROCESS') throw new Error(step.kind);
    const evaluation = evaluatePostCallReport(report, step.pending);
    await applyPostCallBooking(deps, { attempt: s.attempt, step, evaluation });
    expect((await intentsOf(tdb.db, s.scope))[0]?.status).toBe('NEEDS_REVIEW');
    // Reentrega do MESMO relatório: o motivo já decidido não pode se perder.
    expect(await reports.ingest(s.attempt, report)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['BOOKING_ACCEPTANCE_UNCLEAR'],
    });
    expect(await s.state()).toEqual({
      meetings: 0,
      intents: ['NEEDS_REVIEW:ACCEPTANCE_UNCLEAR'],
      reconciliation: { status: 'NEEDS_REVIEW', reasons: ['BOOKING_ACCEPTANCE_UNCLEAR'] },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('A4: report A paused after recording, conflicting B arrives, A resumes — nothing is booked', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    await s.endCall();
    const a = postCallReport(bookingTimeline({ listRevision }));
    const b = postCallReport(bookingTimeline({ listRevision, reply: 'Não.' }));
    const step = await recordReport(tdb.db, { attempt: s.attempt, report: a, now: clock.now() });
    if (step.kind !== 'PROCESS') throw new Error(step.kind);
    expect(await reports.ingest(s.attempt, b)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['REPORT_CONFLICT'],
    });
    const evaluation = evaluatePostCallReport(a, step.pending);
    expect(evaluation.booking.decision).toBe('ACCEPTED');
    await applyPostCallBooking(deps, { attempt: s.attempt, step, evaluation });
    expect(await s.state()).toEqual({
      meetings: 0,
      intents: ['NEEDS_REVIEW:REPORT_CONFLICT'],
      reconciliation: { status: 'NEEDS_REVIEW', reasons: ['REPORT_CONFLICT'] },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('A6: after the final report, late commercial tools are refused; a late opt-out still suppresses', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    // Relatório chega com a sessão local ainda ACTIVE (a tentativa não foi encerrada).
    const report = postCallReport(bookingTimeline({ listRevision }));
    expect((await reports.ingest(s.attempt, report)).status).toBe('RECONCILED');
    const late = { listRevision, option: 2, leadConfirmation: 'Sim.' };
    expect(await service.requestBooking(s.scope, late)).toMatchObject({
      status: 'REFUSED',
      reason: 'SESSION_NOT_ACTIVE',
    });
    expect(await service.findSlots(s.scope, {})).toMatchObject({ reason: 'SESSION_NOT_ACTIVE' });
    expect(await service.recordOutcome(s.scope, { outcome: 'CONTACTED' })).toEqual({
      status: 'REFUSED',
      reason: 'SESSION_NOT_ACTIVE',
    });
    expect((await service.recordOptOut(s.scope, {})).status).toBe('RECORDED');
    const state = await s.state();
    expect(state).toMatchObject({
      meetings: 1,
      intents: ['BOOKED:LEAD_AFFIRMED_READBACK'],
      reconciliation: { status: 'RECONCILED', reasons: [] },
      suppressions: 1,
      nextClaim: 'JOB_REFUSED_SUPPRESSED',
    });
  });

  it('A6: a request racing the report never leaves an unprocessed pending intent', async () => {
    for (let round = 0; round < 3; round += 1) {
      const s = await setup();
      const { listRevision } = await offerAndRequest(service, s.scope);
      const report = postCallReport(bookingTimeline({ listRevision }));
      const late = { listRevision, option: 2, leadConfirmation: 'Sim.' };
      await Promise.all([reports.ingest(s.attempt, report), service.requestBooking(s.scope, late)]);
      const statuses = (await intentsOf(tdb.db, s.scope)).map((i) => i.status);
      expect(statuses).not.toContain('PENDING_EVIDENCE');
      const { reconciliation, meetings } = await s.state();
      // Recusado pelo selo (reserva da opção 1) ou gravado antes dele (examinado ⇒ revisão).
      expect([
        [1, 'RECONCILED'],
        [0, 'NEEDS_REVIEW'],
      ]).toContainEqual([meetings, reconciliation?.status]);
    }
  });
});
