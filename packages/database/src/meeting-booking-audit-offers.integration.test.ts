import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { DrizzleSchedulingAvailabilityRepository } from './repositories/scheduling-availability-repository.js';
import { DrizzleSchedulingCalendarRepository } from './repositories/scheduling-calendar-repository.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { meetingSlotOffers } from './schema/meeting-slot-offers.js';
import { meetings } from './schema/meetings.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createControlledClock,
  createSyntheticLead,
  createWeekdayCalendar,
  prepareSyntheticAttempt,
  SAO_PAULO_POLICY,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('meeting-audit-offers');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = at('2026-12-01T13:00:00.000Z');
const AGENT = { type: 'AGENT' as const, id: 'agent-version-audit' };
const USER = SCHEDULING_TEST_USER;

/** Auditoria E1 — A1 (intervalo da oferta), A2 (tempo após as travas), A3 (tentativa ↔ lead). */
describe('E1 audit: offered slot integrity', () => {
  const clock = createControlledClock();
  const booking = new DrizzleMeetingBookingService(tdb.db, clock.now);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  const calendars = new DrizzleSchedulingCalendarRepository(tdb.db);
  const availability = new DrizzleSchedulingAvailabilityRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;
  let locker: pg.Client;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    locker = new pg.Client({ connectionString: tdb.url });
    await locker.connect();
  });

  afterAll(async () => {
    await locker.end();
    await tdb.drop();
  });

  async function offerFor(input: { attemptPhone?: 'SAME' | 'OTHER' } = {}) {
    clock.set(SCHEDULING_TEST_NOW);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead, contact } = await createSyntheticLead(tdb.db, orgA);
    const other = await createSyntheticLead(tdb.db, orgA);
    const phone = input.attemptPhone === 'OTHER' ? other.contact.phoneE164 : contact.phoneE164;
    const attemptId = await prepareSyntheticAttempt(tdb.db, {
      tenant: fx.tenantA,
      destinationPhone: phone,
    });
    const offered = await slots.offerSlots({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      sourceAttemptId: attemptId,
      now: SCHEDULING_TEST_NOW,
      from: TUESDAY_10,
      to: at('2026-12-02T03:00:00Z'),
      limit: 1,
    });
    return { calendar, lead, attemptId, offered };
  }

  const bookOffer = (offerId: string, sourceAttemptId: string, idempotencyKey = key()) =>
    booking.bookOfferedSlot({
      organizationId: orgA,
      offerId,
      sourceAttemptId,
      idempotencyKey,
      actor: AGENT,
    });

  async function offerState(offerId: string) {
    const [row] = await tdb.db
      .select()
      .from(meetingSlotOffers)
      .where(eq(meetingSlotOffers.id, offerId));
    const booked = await tdb.db.select().from(meetings).where(eq(meetings.slotOfferId, offerId));
    return { status: row!.status, meetings: booked.length };
  }

  /** Espera controlada: a reserva precisa estar bloqueada ESPECIFICAMENTE por esta conexão (trava do lead). */
  async function waitForLockWaiter() {
    for (let i = 0; i < 200; i += 1) {
      const { rows } = await locker.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pg_backend_pid() = ANY (pg_blocking_pids(pid))',
      );
      if (rows[0]!.n > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Booking never waited on the lead lock.');
  }

  it('A1: refuses an offer whose interval no longer matches the current policy (new offer required)', async () => {
    const { calendar, lead, attemptId, offered } = await offerFor();
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    const changed = await calendars.updatePolicy({
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      actor: USER,
      policy: { ...SAO_PAULO_POLICY, slotDurationMinutes: 60 },
    });
    expect(changed.kind).toBe('UPDATED');
    expect(await bookOffer(offered.offers[0]!.id, attemptId)).toEqual({ kind: 'OFFER_STALE' });
    expect(await offerState(offered.offers[0]!.id)).toEqual({ status: 'OFFERED', meetings: 0 });
    const view = await leads.getLead(orgA, lead.id);
    expect([view!.status, view!.history.length]).toEqual(['NEW', 1]);
  });

  it('A2: decides expiry with the clock read AFTER waiting for the lead lock', async () => {
    const { lead, attemptId, offered } = await offerFor();
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    const offer = offered.offers[0]!;
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [lead.id]);
    const pending = bookOffer(offer.id, attemptId);
    await waitForLockWaiter();
    clock.set(new Date(offer.expiresAt.getTime() + 1_000));
    await locker.query('COMMIT');
    expect(await pending).toEqual({ kind: 'OFFER_EXPIRED' });
    expect(await offerState(offer.id)).toEqual({ status: 'OFFERED', meetings: 0 });
  });

  it('A2: re-evaluates minimum notice after the wait and still replays a valid past booking', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    clock.set(SCHEDULING_TEST_NOW); // 08:00 local; antecedência libera 09:00
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [lead.id]);
    const request = {
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      actor: USER,
      idempotencyKey: key(),
    };
    const pending = booking.bookMeeting({ ...request, startsAt: at('2026-11-30T12:00:00.000Z') });
    await waitForLockWaiter();
    clock.set(at('2026-11-30T11:30:00.000Z'));
    await locker.query('COMMIT');
    expect(await pending).toEqual({ kind: 'SLOT_UNAVAILABLE', reason: 'INSIDE_MINIMUM_NOTICE' });

    const valid = await offerFor();
    if (valid.offered.kind !== 'OFFERED') throw new Error(valid.offered.kind);
    const fixedKey = key();
    const first = await bookOffer(valid.offered.offers[0]!.id, valid.attemptId, fixedKey);
    expect(first.kind).toBe('BOOKED');
    clock.set(new Date(valid.offered.offers[0]!.expiresAt.getTime() + 3_600_000));
    const replay = await bookOffer(valid.offered.offers[0]!.id, valid.attemptId, fixedKey);
    expect(replay.kind).toBe('REPLAYED');
  });

  it('A3: never offers a slot for an attempt that dialed another person of the same organization', async () => {
    const mismatch = await offerFor({ attemptPhone: 'OTHER' });
    expect(mismatch.offered).toEqual({ kind: 'ATTEMPT_LEAD_MISMATCH' });
    const happy = await offerFor({ attemptPhone: 'SAME' });
    if (happy.offered.kind !== 'OFFERED') throw new Error(happy.offered.kind);
    const booked = await bookOffer(happy.offered.offers[0]!.id, happy.attemptId);
    expect(booked.kind === 'BOOKED' && booked.meeting.sourceAttemptId).toBe(happy.attemptId);
  });

  it('A3: keeps administrative bookings without a call attempt', async () => {
    clock.set(SCHEDULING_TEST_NOW);
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const booked = await booking.bookMeeting({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    });
    expect(
      booked.kind === 'BOOKED' && [booked.meeting.sourceAttemptId, booked.meeting.slotOfferId],
    ).toEqual([null, null]);
  });

  it('refuses an offer after the availability was blocked, keeping the offer unused', async () => {
    const { calendar, attemptId, offered } = await offerFor();
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    await availability.addException({
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      actor: USER,
      exception: { localDate: '2026-12-01', kind: 'UNAVAILABLE', window: null, reason: null },
    });
    expect(await bookOffer(offered.offers[0]!.id, attemptId)).toEqual({
      kind: 'SLOT_UNAVAILABLE',
      reason: 'OUTSIDE_AVAILABILITY',
    });
    expect(await offerState(offered.offers[0]!.id)).toEqual({ status: 'OFFERED', meetings: 0 });
  });

  it('replays after a lost response without creating a second meeting', async () => {
    const { lead, attemptId, offered } = await offerFor();
    if (offered.kind !== 'OFFERED') throw new Error(offered.kind);
    const fixedKey = key();
    const committed = await bookOffer(offered.offers[0]!.id, attemptId, fixedKey); // resposta "perdida"
    const retried = await bookOffer(offered.offers[0]!.id, attemptId, fixedKey);
    expect(committed.kind).toBe('BOOKED');
    expect(retried).toEqual({
      kind: 'REPLAYED',
      meeting: (committed as { meeting: unknown }).meeting,
    });
    const rows = await tdb.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.organizationId, orgA), eq(meetings.leadId, lead.id)));
    expect(rows).toHaveLength(1);
  });
});
