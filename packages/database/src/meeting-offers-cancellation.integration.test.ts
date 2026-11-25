import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleMeetingCancellationService } from './repositories/meeting-cancellation-service.js';
import { DrizzleMeetingQueries } from './repositories/meeting-queries.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { auditLogs } from './schema/audit.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createSyntheticLead,
  createWeekdayCalendar,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('meeting-offers-e1');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = at('2026-12-01T13:00:00.000Z');
const AGENT = { type: 'AGENT' as const, id: 'agent-version-test' };

/** E1 (DEC-074) — cancelamento, ofertas de horário, tentativa de ligação e isolamento. */
describe('E1 meeting offers and cancellation (PostgreSQL)', () => {
  const booking = new DrizzleMeetingBookingService(tdb.db);
  const cancellation = new DrizzleMeetingCancellationService(tdb.db);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  const queries = new DrizzleMeetingQueries(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function prepareAttempt(tenant: TenantFixture) {
    const jobId = await createExtraJob(tdb.db, { tenant, tag: 'meeting' });
    const prepared = await attempts.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    return prepared.record.attempt.id;
  }

  async function bookedMeeting() {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const base = {
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      actor: SCHEDULING_TEST_USER,
      now: SCHEDULING_TEST_NOW,
    };
    const outcome = await booking.bookMeeting({
      ...base,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
    });
    if (outcome.kind !== 'BOOKED') throw new Error(outcome.kind);
    return { calendar, lead, meeting: outcome.meeting, base };
  }

  it('cancels idempotently, frees the slot and returns the lead to QUALIFIED', async () => {
    const { lead, meeting, base } = await bookedMeeting();
    const cancel = (expectedVersion: number) =>
      cancellation.cancelMeeting({
        organizationId: orgA,
        meetingId: meeting.id,
        expectedVersion,
        actor: SCHEDULING_TEST_USER,
        reason: 'Lead pediu outro dia',
        now: SCHEDULING_TEST_NOW,
      });
    expect(await cancel(7)).toEqual({ kind: 'VERSION_CONFLICT' });
    const canceled = await cancel(1);
    expect(
      canceled.kind === 'CANCELED' && [canceled.meeting.status, canceled.meeting.version],
    ).toEqual(['CANCELED', 2]);
    expect((await cancel(1)).kind).toBe('ALREADY_CANCELED');
    expect((await leads.getLead(orgA, lead.id))!.status).toBe('QUALIFIED');
    const other = await createSyntheticLead(tdb.db, orgA);
    const rebooked = await booking.bookMeeting({
      ...base,
      leadId: other.lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
    });
    expect(rebooked.kind).toBe('BOOKED');
    const actions = await tdb.db.select().from(auditLogs).where(eq(auditLogs.targetId, meeting.id));
    expect(actions.map((a) => a.action).sort()).toEqual(['meeting.booked', 'meeting.canceled']);
  });

  it('books only the exact offered slot, once, before expiry and for the same attempt', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const attemptId = await prepareAttempt(fx.tenantA);
    const offered = await slots.offerSlots({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      sourceAttemptId: attemptId,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: at('2026-12-02T03:00:00Z'),
      limit: 2,
    });
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    expect(offered.offers.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-12-01T13:00:00.000Z',
      '2026-12-01T13:30:00.000Z',
    ]);
    const [first, second] = offered.offers;
    const book = (
      offerId: string,
      sourceAttemptId: string | undefined,
      now = SCHEDULING_TEST_NOW,
      idempotencyKey = key(),
    ) =>
      booking.bookOfferedSlot({
        organizationId: orgA,
        offerId,
        sourceAttemptId,
        idempotencyKey,
        actor: AGENT,
        now,
      });
    expect(await book(first!.id, undefined)).toEqual({ kind: 'OFFER_NOT_FOUND' }); // outra tentativa
    expect(await book(first!.id, attemptId, at('2026-11-30T11:16:00Z'))).toEqual({
      kind: 'OFFER_EXPIRED',
    });
    const fixedKey = key();
    const booked = await book(first!.id, attemptId, SCHEDULING_TEST_NOW, fixedKey);
    expect(
      booked.kind === 'BOOKED' && [
        booked.meeting.slotOfferId,
        booked.meeting.sourceAttemptId,
        booked.meeting.bookedByType,
      ],
    ).toEqual([first!.id, attemptId, 'AGENT']);
    expect((await book(first!.id, attemptId, SCHEDULING_TEST_NOW, fixedKey)).kind).toBe('REPLAYED');
    expect(await book(second!.id, attemptId)).toEqual({ kind: 'LEAD_HAS_ACTIVE_MEETING' });
  });

  it('allows one active meeting per call attempt and rejects attempts of other tenants', async () => {
    const { base } = await bookedMeeting();
    const attemptId = await prepareAttempt(fx.tenantA);
    const otherLead = await createSyntheticLead(tdb.db, orgA);
    const third = await createSyntheticLead(tdb.db, orgA);
    const first = await booking.bookMeeting({
      ...base,
      leadId: otherLead.lead.id,
      startsAt: at('2026-12-02T13:00:00Z'),
      idempotencyKey: key(),
      sourceAttemptId: attemptId,
    });
    expect(first.kind).toBe('BOOKED');
    const second = await booking.bookMeeting({
      ...base,
      leadId: third.lead.id,
      startsAt: at('2026-12-03T13:00:00Z'),
      idempotencyKey: key(),
      sourceAttemptId: attemptId,
    });
    expect(second).toEqual({ kind: 'ATTEMPT_HAS_ACTIVE_MEETING' });
    const foreignAttempt = await prepareAttempt(fx.tenantB);
    const crossed = await booking.bookMeeting({
      ...base,
      leadId: third.lead.id,
      startsAt: at('2026-12-04T13:00:00Z'),
      idempotencyKey: key(),
      sourceAttemptId: foreignAttempt,
    });
    expect(crossed).toEqual({ kind: 'ATTEMPT_NOT_FOUND' });
  });

  it('refuses DO_NOT_CALL leads for offers and bookings', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    await leads.changeLeadStatus({
      organizationId: orgA,
      leadId: lead.id,
      status: 'DO_NOT_CALL',
      expectedVersion: 1,
      actor: SCHEDULING_TEST_USER,
    });
    const offered = await slots.offerSlots({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: at('2026-12-02T03:00:00Z'),
      limit: 2,
    });
    expect(offered).toEqual({ kind: 'LEAD_NOT_BOOKABLE' });
    const booked = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: SCHEDULING_TEST_USER,
      now: SCHEDULING_TEST_NOW,
    });
    expect(booked).toEqual({ kind: 'LEAD_BLOCKED', reason: 'LEAD_DO_NOT_CALL' });
  });

  it('isolates bookings, cancellations and listings between organizations', async () => {
    const { meeting, base } = await bookedMeeting();
    const orgB = fx.tenantB.organizationId;
    const leadB = await createSyntheticLead(tdb.db, orgB);
    expect(
      (
        await booking.bookMeeting({
          ...base,
          organizationId: orgB,
          startsAt: at('2026-12-02T13:00:00Z'),
          idempotencyKey: key(),
        })
      ).kind,
    ).toBe('LEAD_NOT_FOUND');
    expect(
      (
        await booking.bookMeeting({
          ...base,
          organizationId: orgB,
          leadId: leadB.lead.id,
          startsAt: at('2026-12-02T13:00:00Z'),
          idempotencyKey: key(),
        })
      ).kind,
    ).toBe('CALENDAR_NOT_FOUND');
    expect(
      await cancellation.cancelMeeting({
        organizationId: orgB,
        meetingId: meeting.id,
        expectedVersion: 1,
        actor: SCHEDULING_TEST_USER,
        now: SCHEDULING_TEST_NOW,
      }),
    ).toEqual({ kind: 'NOT_FOUND' });
    const window = { from: at('2026-11-30T00:00:00Z'), to: at('2026-12-31T00:00:00Z') };
    expect(
      (await queries.listMeetings({ organizationId: orgB, ...window })).map((r) => r.meeting.id),
    ).not.toContain(meeting.id);
    expect(
      (await queries.listMeetings({ organizationId: orgA, ...window })).map((r) => r.meeting.id),
    ).toContain(meeting.id);
    expect(await queries.getMeeting(orgB, meeting.id)).toBeNull();
  });
});
