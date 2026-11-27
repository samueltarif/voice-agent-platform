import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { bookingTimeline, SILENT_TIMELINE } from './test-support/post-call-timelines.js';
import {
  createAgentScenario,
  intentsOf,
  leadStatusOf,
  leadStatusOrigins,
  meetingsOfLead,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
  reconciliationOf,
  suppressionsOf,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-post-call');

/**
 * E2 simplificada (DEC-077) — opt-out preventivo e pós-chamada, resultado
 * comercial com evidência independente e robustez do relatório (duplicado,
 * conflitante, ausente, de outra sessão ou tenant).
 */
describe('E2 simplified: opt-out, call outcome and post-call report robustness', () => {
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

  async function setup(
    options: { calendarId?: null; tenant?: DurableOutboundFixture['tenantB'] } = {},
  ) {
    clock.set(SCHEDULING_TEST_NOW);
    const s = await createAgentScenario(tdb.db, { fx, ...options });
    const org = s.scope.organizationId;
    return {
      ...s,
      attempt: await postCallAttemptOf(tdb.db, s),
      meetings: () => meetingsOfLead(tdb.db, org, s.leadId),
      suppressions: () => suppressionsOf(tdb.db, org, s.phone),
      status: () => leadStatusOf(tdb.db, org, s.leadId),
      reconciliation: () => reconciliationOf(tdb.db, s.scope),
    };
  }

  it('the opt-out tool suppresses at once and cancels the pending intent, even if the history shows acceptance', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    const opted = await service.recordOptOut(s.scope, { leadPhrase: 'Não me ligue mais.' });
    expect(opted).toMatchObject({ status: 'RECORDED', meetingPreserved: false });
    expect(await s.suppressions()).toBe(1);
    expect(await s.status()).toBe('DO_NOT_CALL');
    expect((await intentsOf(tdb.db, s.scope))[0]).toMatchObject({
      status: 'CANCELED',
      decisionReason: 'OPT_OUT',
    });
    expect(await service.findSlots(s.scope, {})).toMatchObject({ reason: 'OPT_OUT_REQUESTED' });
    const result = await reports.ingest(
      s.attempt,
      postCallReport(bookingTimeline({ listRevision })),
    );
    // Supressão mantida; ferramenta sem pedido no histórico vai para conferência humana.
    expect(result).toEqual({ status: 'NEEDS_REVIEW', reasons: ['OPT_OUT_TOOL_WITHOUT_EVIDENCE'] });
    expect(await s.meetings()).toHaveLength(0);
    expect(await s.suppressions()).toBe(1);
  });

  it('an opt-out said only in the conversation is suppressed by the reconciliation', async () => {
    const s = await setup();
    const timeline = [...SILENT_TIMELINE, { kind: 'LEAD' as const, text: 'Não me ligue mais.' }];
    expect(await reports.ingest(s.attempt, postCallReport(timeline))).toEqual({
      status: 'RECONCILED',
      reasons: [],
    });
    expect(await s.suppressions()).toBe(1);
    expect(await s.status()).toBe('DO_NOT_CALL');
  });

  it('an unclear opt-out mention blocks the booking and goes to review, without suppressing', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    const after = [
      { kind: 'LEAD' as const, text: 'Se eu mudar de ideia, vou pedir para tirar meu número.' },
    ];
    const result = await reports.ingest(
      s.attempt,
      postCallReport(bookingTimeline({ listRevision, after })),
    );
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.reasons).toEqual(['OPT_OUT_MENTION_UNCLEAR', 'BOOKING_OPT_OUT_MENTION_UNCLEAR']);
    expect(await s.meetings()).toHaveLength(0);
    expect(await s.suppressions()).toBe(0);
  });

  it('suppresses the dialed phone even without a lead or a calendar', async () => {
    const s = await setup({ calendarId: null });
    expect((await service.recordOptOut(s.scope, {})).status).toBe('RECORDED');
    expect(await s.suppressions()).toBe(1);
  });

  it('a proposed outcome applies only with the lead speaking in the history (D5)', async () => {
    const s = await setup();
    expect(await service.recordOutcome(s.scope, { outcome: 'CONTACTED' })).toEqual({
      status: 'PROPOSED',
      outcome: 'CONTACTED',
    });
    expect(await s.status()).toBe('NEW');
    await reports.ingest(s.attempt, postCallReport(bookingTimeline({ listRevision: 9 })));
    expect(await s.status()).toBe('CONTACTED');
    expect((await s.reconciliation())?.outcomeApplied).toBe('CONTACTED');
  });

  it('silence or a generic timeout never becomes NOT_INTERESTED; status and history unchanged', async () => {
    const s = await setup();
    await service.recordOutcome(s.scope, { outcome: 'NOT_INTERESTED' });
    const report = postCallReport(SILENT_TIMELINE, { endReason: 'TIMEOUT_UNSPECIFIED' });
    expect(await reports.ingest(s.attempt, report)).toEqual({ status: 'RECONCILED', reasons: [] });
    expect(await s.status()).toBe('NEW');
    expect(await leadStatusOrigins(tdb.db, s.scope.organizationId, s.leadId)).toEqual([
      { origin: 'CREATED', to: 'NEW' },
    ]);
    expect((await s.reconciliation())?.reportEndReason).toBe('TIMEOUT_UNSPECIFIED');
  });

  it('a duplicate report has no second effect; a conflicting one goes to review', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    const report = postCallReport(bookingTimeline({ listRevision }));
    expect((await reports.ingest(s.attempt, report)).status).toBe('RECONCILED');
    expect(await reports.ingest(s.attempt, report)).toEqual({
      status: 'DUPLICATE',
      reasons: ['RECONCILED'],
    });
    expect(await s.meetings()).toHaveLength(1);
    const changed = postCallReport(bookingTimeline({ listRevision, reply: 'Não.' }));
    expect(await reports.ingest(s.attempt, changed)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['REPORT_CONFLICT'],
    });
    expect(await s.meetings()).toHaveLength(1);
    expect((await s.reconciliation())?.status).toBe('NEEDS_REVIEW');
  });

  it('a missing report expires to review; only a human decision releases the phone', async () => {
    const s = await setup();
    await offerAndRequest(service, s.scope);
    expect(await reports.expireOverdue({ olderThanMinutes: 30 })).toBe(0);
    clock.set(new Date(SCHEDULING_TEST_NOW.getTime() + 60 * 60_000));
    expect(await reports.expireOverdue({ olderThanMinutes: 30 })).toBeGreaterThanOrEqual(1);
    expect(await s.reconciliation()).toMatchObject({
      status: 'NEEDS_REVIEW',
      reviewReasons: ['REPORT_MISSING'],
    });
    expect((await intentsOf(tdb.db, s.scope))[0]?.status).toBe('NEEDS_REVIEW');
    const key = { organizationId: s.scope.organizationId, sessionId: s.sessionId };
    expect(await reports.resolveReview({ ...key, userId: fx.userId })).toBe('RESOLVED');
    expect(await s.reconciliation()).toMatchObject({
      status: 'RECONCILED',
      reconciledBy: `user:${fx.userId}`,
    });
    expect(await s.meetings()).toHaveLength(0);
  });

  it('a report for another session, attempt or tenant has no effect', async () => {
    const a = await setup();
    const { listRevision } = await offerAndRequest(service, a.scope);
    const report = postCallReport(bookingTimeline({ listRevision }));
    const b = await setup({ tenant: fx.tenantB });
    const crossTenant = { ...b.attempt, callSessionId: a.sessionId };
    expect(await reports.ingest(crossTenant, report)).toEqual({
      status: 'REJECTED',
      reasons: ['SESSION_NOT_FOUND'],
    });
    const sameTenant = await setup();
    const otherAttempt = { ...sameTenant.attempt, callSessionId: a.sessionId };
    expect(await reports.ingest(otherAttempt, report)).toEqual({
      status: 'REJECTED',
      reasons: ['ATTEMPT_MISMATCH'],
    });
    expect(await reports.ingest({ ...a.attempt, callSessionId: null }, report)).toEqual({
      status: 'REJECTED',
      reasons: ['NO_SESSION'],
    });
    expect(await a.meetings()).toHaveLength(0);
    expect((await a.reconciliation())?.status).toBe('AWAITING_REPORT');
  });

  it('a forged scope never records outcomes, opt-outs or requests', async () => {
    const s = await setup();
    const forged = { ...s.scope, sessionId: randomUUID() };
    expect(await service.recordOutcome(forged, { outcome: 'QUALIFIED' })).toEqual({
      status: 'REFUSED',
      reason: 'CONTEXT_REFUSED',
    });
    expect((await service.recordOptOut(forged, {})).status).toBe('REFUSED');
    expect(
      (
        await service.requestBooking(forged, {
          listRevision: 1,
          option: 1,
          leadConfirmation: 'Sim.',
        })
      ).status,
    ).toBe('REFUSED');
    expect(await s.suppressions()).toBe(0);
  });
});
