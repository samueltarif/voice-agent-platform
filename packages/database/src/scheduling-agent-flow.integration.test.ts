import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { bookingTimeline, READBACK_09H30 } from './test-support/post-call-timelines.js';
import {
  createAgentScenario,
  intentsOf,
  meetingsOfLead,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
  reconciliationOf,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-agent-flow');
const MINUTE = 60_000;

/**
 * E2 simplificada (DEC-077) — conexão DIRETA: a ferramenta só registra a
 * intenção; a reunião nasce da reconciliação pós-chamada, com aceite
 * comprovado no histórico e a reserva transacional da E1.
 */
describe('E2 simplified: pending intent, post-call evidence and transactional booking', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup(options: { calendarId?: null } = {}) {
    clock.set(SCHEDULING_TEST_NOW);
    const scenario = await createAgentScenario(tdb.db, { fx, ...options });
    const meetings = () => meetingsOfLead(tdb.db, scenario.scope.organizationId, scenario.leadId);
    return { ...scenario, meetings, attempt: await postCallAttemptOf(tdb.db, scenario) };
  }

  it('the tool never books; the post-call evidence does, through the E1 transaction', async () => {
    const s = await setup();
    const requested = await offerAndRequest(service, s.scope, { option: 2 });
    expect(requested.label).toContain('às 09:30');
    expect(await s.meetings()).toHaveLength(0);
    const [intent] = await intentsOf(tdb.db, s.scope);
    expect(intent).toMatchObject({ status: 'PENDING_EVIDENCE', option: 2 });
    expect((await reconciliationOf(tdb.db, s.scope))?.status).toBe('AWAITING_REPORT');

    const timeline = bookingTimeline({
      listRevision: requested.listRevision,
      option: 2,
      readback: READBACK_09H30,
    });
    const result = await reports.ingest(s.attempt, postCallReport(timeline));
    expect(result).toEqual({ status: 'RECONCILED', reasons: [] });
    const [meeting, ...others] = await s.meetings();
    expect(others).toHaveLength(0);
    expect(meeting).toMatchObject({ slotOfferId: intent!.offerId, bookedByType: 'AGENT' });
    expect(meeting!.startsAt.toISOString()).toBe('2026-11-30T12:30:00.000Z');
    expect((await intentsOf(tdb.db, s.scope))[0]).toMatchObject({
      status: 'BOOKED',
      meetingId: meeting!.id,
    });
    expect((await reconciliationOf(tdb.db, s.scope))?.status).toBe('RECONCILED');
  });

  it('a fabricated acceptance (tool phrase "sim", history "não") never books', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope, {
      phrase: 'Sim, pode marcar.',
    });
    const timeline = bookingTimeline({ listRevision, reply: 'Não, obrigado.' });
    expect(await reports.ingest(s.attempt, postCallReport(timeline))).toEqual({
      status: 'RECONCILED',
      reasons: [],
    });
    expect(await s.meetings()).toHaveLength(0);
    expect((await intentsOf(tdb.db, s.scope))[0]).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'LEAD_DECLINED',
    });
  });

  it('ambiguous evidence goes to human review and never books', async () => {
    const cases = [
      {
        name: 'unclear reply',
        change: { reply: 'Talvez, vou ver.' },
        reason: 'BOOKING_ACCEPTANCE_UNCLEAR',
      },
      {
        name: 'no readback of the slot',
        change: { readback: 'Posso marcar?' },
        reason: 'BOOKING_READBACK_NOT_EVIDENT',
      },
      {
        name: 'wrong slot read back',
        change: { readback: READBACK_09H30 },
        reason: 'BOOKING_READBACK_NOT_EVIDENT',
      },
      {
        name: 'retraction after the request',
        change: { after: [{ kind: 'LEAD' as const, text: 'Espera, não, outro dia.' }] },
        reason: 'BOOKING_LEAD_REPLY_AFTER_REQUEST',
      },
    ];
    for (const item of cases) {
      const s = await setup();
      const { listRevision } = await offerAndRequest(service, s.scope);
      const result = await reports.ingest(
        s.attempt,
        postCallReport(bookingTimeline({ listRevision, ...item.change })),
      );
      expect([item.name, result]).toEqual([
        item.name,
        { status: 'NEEDS_REVIEW', reasons: [item.reason] },
      ]);
      expect([item.name, (await s.meetings()).length]).toEqual([item.name, 0]);
      expect((await intentsOf(tdb.db, s.scope))[0]?.status).toBe('NEEDS_REVIEW');
    }
  });

  it('the tool call must be in the history for the SAME list and option, in a proven order', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    const other = bookingTimeline({ listRevision, option: 3 });
    expect((await reports.ingest(s.attempt, postCallReport(other))).reasons).toEqual([
      'BOOKING_TOOL_CALL_NOT_IN_REPORT',
    ]);
    const t = await setup();
    const second = await offerAndRequest(service, t.scope);
    const unordered = postCallReport(bookingTimeline({ listRevision: second.listRevision }), {
      ordering: 'UNKNOWN',
    });
    expect((await reports.ingest(t.attempt, unordered)).reasons).toEqual([
      'BOOKING_ORDERING_UNKNOWN',
    ]);
    expect(await s.meetings()).toHaveLength(0);
    expect(await t.meetings()).toHaveLength(0);
  });

  it('an offer expired before the report arrives is never booked (review)', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    clock.set(new Date(SCHEDULING_TEST_NOW.getTime() + 16 * MINUTE));
    const result = await reports.ingest(
      s.attempt,
      postCallReport(bookingTimeline({ listRevision })),
    );
    expect(result).toEqual({ status: 'NEEDS_REVIEW', reasons: ['BOOKING_OFFER_EXPIRED'] });
    expect(await s.meetings()).toHaveLength(0);
  });

  it('the request is bound to the current list and an unexpired offer of this session', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    const ask = (listRevision: number, option = 1) =>
      service.requestBooking(s.scope, { listRevision, option, leadConfirmation: 'Sim.' });
    expect((await ask(found.listRevision + 1)).status).toBe('REFUSED');
    const retry = await service.findSlots(s.scope, {});
    expect(retry).toMatchObject({
      status: 'OFFERED',
      retry: true,
      listRevision: found.listRevision,
    });
    const other = await service.findSlots(s.scope, { day: '2026-12-01' });
    if (other.status !== 'OFFERED') throw new Error(other.status);
    expect(await ask(found.listRevision)).toMatchObject({
      status: 'REFUSED',
      reason: 'OFFER_NOT_CURRENT',
    });
    clock.set(new Date(SCHEDULING_TEST_NOW.getTime() + 16 * MINUTE));
    expect(await ask(other.listRevision)).toMatchObject({
      status: 'REFUSED',
      reason: 'OFFER_EXPIRED',
    });
    expect(await intentsOf(tdb.db, s.scope)).toHaveLength(0);
  });

  it('a new request supersedes the previous one: only the last can become a meeting', async () => {
    const s = await setup();
    const first = await offerAndRequest(service, s.scope, { option: 1 });
    const again = await service.requestBooking(s.scope, {
      listRevision: first.listRevision,
      option: 2,
      leadConfirmation: 'Melhor a segunda.',
    });
    expect(again.status).toBe('PENDING_CONFIRMATION');
    expect((await intentsOf(tdb.db, s.scope)).map((intent) => intent.status)).toEqual([
      'SUPERSEDED',
      'PENDING_EVIDENCE',
    ]);
    const timeline = bookingTimeline({
      listRevision: first.listRevision,
      option: 2,
      readback: READBACK_09H30,
    });
    expect((await reports.ingest(s.attempt, postCallReport(timeline))).status).toBe('RECONCILED');
    const [meeting] = await s.meetings();
    expect(meeting!.startsAt.toISOString()).toBe('2026-11-30T12:30:00.000Z');
  });

  it('A5: a new query without availability voids the previous list for any later request', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    expect(await service.findSlots(s.scope, { day: '2026-12-06' })).toMatchObject({
      status: 'NO_AVAILABILITY',
    });
    const late = await service.requestBooking(s.scope, {
      listRevision: found.listRevision,
      option: 1,
      leadConfirmation: 'Sim.',
    });
    expect(late).toMatchObject({ status: 'REFUSED', reason: 'OFFER_NOT_CURRENT' });
    expect(await intentsOf(tdb.db, s.scope)).toHaveLength(0);
  });

  it('A5: a suppression registered between the offer and the retry or the request is honored', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    await suppressions.addSuppression({
      organizationId: s.scope.organizationId,
      phoneE164: s.phone,
      reason: 'OPT_OUT',
    });
    const request = { listRevision: found.listRevision, option: 1, leadConfirmation: 'Sim.' };
    expect(await service.requestBooking(s.scope, request)).toMatchObject({
      status: 'REFUSED',
      reason: 'LEAD_NOT_BOOKABLE',
    });
    expect(await service.findSlots(s.scope, {})).toMatchObject({
      status: 'REFUSED',
      reason: 'LEAD_NOT_BOOKABLE',
    });
    expect(await intentsOf(tdb.db, s.scope)).toHaveLength(0);
  });

  it('without a pinned calendar there is no scheduling', async () => {
    const s = await setup({ calendarId: null });
    expect(await service.findSlots(s.scope, {})).toMatchObject({ status: 'REFUSED' });
    expect(
      await service.requestBooking(s.scope, {
        listRevision: 1,
        option: 1,
        leadConfirmation: 'Sim.',
      }),
    ).toMatchObject({ status: 'REFUSED', reason: 'SCHEDULING_UNAVAILABLE' });
  });
});
