import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import { meetings } from './schema/meetings.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createSyntheticLead,
  createWeekdayCalendar,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('meeting-booking-e1');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
// Terça 01/12/2026, 10:00 em São Paulo.
const TUESDAY_10 = at('2026-12-01T13:00:00.000Z');

/** E1 (DEC-074) — reserva transacional: validação, idempotência e concorrência. */
describe('E1 meeting booking (PostgreSQL)', () => {
  const booking = new DrizzleMeetingBookingService(tdb.db);
  const leads = new DrizzleLeadRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function scenario(policy?: Parameters<typeof createWeekdayCalendar>[1]['policy']) {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA, policy });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const request = (startsAt = TUESDAY_10, idempotencyKey = key(), leadId = lead.id) => ({
      organizationId: orgA,
      calendarId: calendar.id,
      leadId,
      startsAt,
      idempotencyKey,
      actor: SCHEDULING_TEST_USER,
      now: SCHEDULING_TEST_NOW,
    });
    return { calendar, lead, request };
  }

  it('books a valid slot and moves the lead to MEETING_SCHEDULED with history', async () => {
    const { lead, request } = await scenario();
    const outcome = await booking.bookMeeting(request());
    expect(outcome.kind).toBe('BOOKED');
    if (outcome.kind !== 'BOOKED') return;
    expect([outcome.meeting.startsAt.toISOString(), outcome.meeting.endsAt.toISOString()]).toEqual([
      '2026-12-01T13:00:00.000Z',
      '2026-12-01T13:30:00.000Z',
    ]);
    const view = await leads.getLead(orgA, lead.id);
    expect(view!.status).toBe('MEETING_SCHEDULED');
    expect(view!.history.at(-1)).toMatchObject({
      origin: 'MEETING_BOOKED',
      meetingId: outcome.meeting.id,
    });
  });

  it('replays the same request and rejects a reused key with a different request', async () => {
    const { request } = await scenario();
    const fixedKey = key();
    const first = await booking.bookMeeting(request(TUESDAY_10, fixedKey));
    const replay = await booking.bookMeeting(request(TUESDAY_10, fixedKey));
    expect(replay).toEqual({ kind: 'REPLAYED', meeting: (first as { meeting: unknown }).meeting });
    expect(await booking.bookMeeting(request(at('2026-12-01T13:30:00.000Z'), fixedKey))).toEqual({
      kind: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(
      await tdb.db.select().from(meetings).where(eq(meetings.idempotencyKey, fixedKey)),
    ).toHaveLength(1);
  });

  it('rejects invalid dates, notice, horizon, off-grid and out-of-availability starts', async () => {
    const { request } = await scenario();
    const reason = async (startsAt: Date) => {
      const outcome = await booking.bookMeeting(request(startsAt));
      return outcome.kind === 'SLOT_UNAVAILABLE' ? outcome.reason : outcome.kind;
    };
    expect(await reason(at('invalid'))).toBe('INVALID_START');
    expect(await reason(at('2026-11-30T11:30:00.000Z'))).toBe('INSIDE_MINIMUM_NOTICE'); // 08:30; antecedência libera a partir das 09:00
    expect(await reason(at('2027-01-05T13:00:00.000Z'))).toBe('BEYOND_BOOKING_HORIZON');
    expect(await reason(at('2026-12-01T13:10:00.000Z'))).toBe('OUTSIDE_AVAILABILITY');
    expect(await reason(at('2026-12-01T17:00:00.000Z'))).toBe('OUTSIDE_AVAILABILITY'); // 14:00 local
    expect(await reason(at('2026-12-05T13:00:00.000Z'))).toBe('OUTSIDE_AVAILABILITY'); // sábado
  });

  it('blocks overlaps, buffer violations and a second active meeting for the same lead', async () => {
    const { request, lead } = await scenario({ bufferMinutes: 30 });
    expect((await booking.bookMeeting(request())).kind).toBe('BOOKED');
    const second = await createSyntheticLead(tdb.db, orgA);
    const slotOf = async (startsAt: Date) => {
      const outcome = await booking.bookMeeting(request(startsAt, key(), second.lead.id));
      return outcome.kind === 'SLOT_UNAVAILABLE' ? outcome.reason : outcome.kind;
    };
    expect(await slotOf(TUESDAY_10)).toBe('SLOT_CONFLICT');
    expect(await slotOf(at('2026-12-01T13:30:00.000Z'))).toBe('SLOT_CONFLICT'); // dentro do buffer
    expect(await slotOf(at('2026-12-01T14:00:00.000Z'))).toBe('BOOKED');
    expect(
      (await booking.bookMeeting(request(at('2026-12-02T13:00:00.000Z'), key(), lead.id))).kind,
    ).toBe('LEAD_HAS_ACTIVE_MEETING');
  });

  it('lets exactly one of many concurrent bookings win the same slot', async () => {
    const { request } = await scenario();
    const contenders = await Promise.all(
      Array.from({ length: 8 }, () => createSyntheticLead(tdb.db, orgA)),
    );
    const outcomes = await Promise.all(
      contenders.map(({ lead }) => booking.bookMeeting(request(TUESDAY_10, key(), lead.id))),
    );
    const kinds = outcomes.map((o) => (o.kind === 'SLOT_UNAVAILABLE' ? o.reason : o.kind));
    expect(kinds.filter((k) => k === 'BOOKED')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'SLOT_CONFLICT')).toHaveLength(7);
    const booked = contenders.filter((_, i) => kinds[i] === 'BOOKED').map((c) => c.lead.id);
    const statuses = await Promise.all(contenders.map(({ lead }) => leads.getLead(orgA, lead.id)));
    expect(statuses.filter((s) => s!.status === 'MEETING_SCHEDULED').map((s) => s!.id)).toEqual(
      booked,
    );
  });

  it('turns concurrent repetitions of one request into one booking and replays', async () => {
    const { request } = await scenario();
    const same = request(TUESDAY_10, key());
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => booking.bookMeeting(same)));
    expect(outcomes.filter((o) => o.kind === 'BOOKED')).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === 'REPLAYED')).toHaveLength(5);
  });

  it('keeps the database exclusion constraint as a last barrier against overlap', async () => {
    const { calendar, request } = await scenario();
    const booked = await booking.bookMeeting(request());
    if (booked.kind !== 'BOOKED') throw new Error(booked.kind);
    const intruder = await createSyntheticLead(tdb.db, orgA);
    const direct = tdb.db.insert(meetings).values({
      ...booked.meeting,
      id: randomUUID(),
      leadId: intruder.lead.id,
      calendarId: calendar.id,
      idempotencyKey: key(),
      startsAt: at('2026-12-01T13:15:00.000Z'),
      endsAt: at('2026-12-01T13:45:00.000Z'),
    });
    const failure = await direct.then(
      () => null,
      (error: unknown) => classifyPostgresFailure(error),
    );
    expect(failure).toEqual({
      kind: 'EXCLUSION_VIOLATION',
      constraint: 'meetings_no_overlap_excl',
    });
  });

  it('respects the calendar timezone across a DST change (America/New_York)', async () => {
    const { request } = await scenario({ timezone: 'America/New_York', minimumNoticeMinutes: 0 });
    // Segunda 02/11/2026 09:00 EST = 14:00Z (na semana anterior, 09:00 EDT = 13:00Z).
    expect((await booking.bookMeeting(request(at('2026-11-02T14:00:00.000Z')))).kind).toBe(
      'SLOT_UNAVAILABLE',
    ); // antes de "agora"
    const later = await booking.bookMeeting(request(at('2026-12-07T14:00:00.000Z')));
    expect(later.kind).toBe('BOOKED');
    const other = await createSyntheticLead(tdb.db, orgA);
    const wrongOffset = await booking.bookMeeting(
      request(at('2026-12-08T13:00:00.000Z'), key(), other.lead.id),
    );
    expect(wrongOffset.kind === 'SLOT_UNAVAILABLE' && wrongOffset.reason).toBe(
      'OUTSIDE_AVAILABILITY',
    );
  });
});
