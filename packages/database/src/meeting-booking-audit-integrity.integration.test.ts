import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { DrizzleMeetingBookingService } from './repositories/meeting-booking-service.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import { leadStatusChanges } from './schema/lead-status-changes.js';
import { meetings } from './schema/meetings.js';
import { schedulingAvailabilityExceptions } from './schema/scheduling-calendars.js';
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

const tdb = await createDisposableTestDatabase('meeting-audit-integrity');
const at = (value: string) => new Date(value);
const key = () => `test-${randomUUID()}`;
const TUESDAY_10 = at('2026-12-01T13:00:00.000Z');
const USER = SCHEDULING_TEST_USER;
const failureOf = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => classifyPostgresFailure(error),
  );

/** Auditoria E1 — M3 (CHECK), M4 (idempotência concorrente), M5 (histórico) e rollback integral. */
describe('E1 audit: database integrity', () => {
  const booking = new DrizzleMeetingBookingService(tdb.db, () => SCHEDULING_TEST_NOW);
  const leads = new DrizzleLeadRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    orgB = fx.tenantB.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  it('M3: the exception CHECK rejects incomplete windows and accepts valid ones', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const insert = (values: {
      kind: 'AVAILABLE' | 'UNAVAILABLE';
      startMinute: number | null;
      endMinute: number | null;
    }) =>
      tdb.db.insert(schedulingAvailabilityExceptions).values({
        organizationId: orgA,
        calendarId: calendar.id,
        localDate: '2026-12-10',
        ...values,
      });
    const check = {
      kind: 'CHECK_VIOLATION',
      constraint: 'scheduling_availability_exceptions_window_chk',
    };
    expect(
      await failureOf(insert({ kind: 'UNAVAILABLE', startMinute: null, endMinute: 600 })),
    ).toEqual(check);
    expect(
      await failureOf(insert({ kind: 'UNAVAILABLE', startMinute: 540, endMinute: null })),
    ).toEqual(check);
    expect(
      await failureOf(insert({ kind: 'AVAILABLE', startMinute: null, endMinute: null })),
    ).toEqual(check);
    expect(
      await failureOf(insert({ kind: 'AVAILABLE', startMinute: 600, endMinute: 540 })),
    ).toEqual(check);
    expect(
      await failureOf(insert({ kind: 'UNAVAILABLE', startMinute: null, endMinute: null })),
    ).toBeNull();
    expect(
      await failureOf(insert({ kind: 'UNAVAILABLE', startMinute: 540, endMinute: 600 })),
    ).toBeNull();
    expect(
      await failureOf(insert({ kind: 'AVAILABLE', startMinute: 0, endMinute: 1440 })),
    ).toBeNull();
  });

  it('M4: concurrent requests with one key and different arguments get IDEMPOTENCY_KEY_REUSED, not a slot conflict', async () => {
    for (let round = 0; round < 5; round += 1) {
      const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
      const otherCalendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
      const [first, second, third] = await Promise.all(
        [1, 2, 3].map(() => createSyntheticLead(tdb.db, orgA)),
      );
      const shared = key();
      const base = {
        organizationId: orgA,
        startsAt: TUESDAY_10,
        idempotencyKey: shared,
        actor: USER,
      };
      const outcomes = await Promise.all([
        booking.bookMeeting({ ...base, calendarId: calendar.id, leadId: first!.lead.id }),
        booking.bookMeeting({ ...base, calendarId: calendar.id, leadId: second!.lead.id }),
        booking.bookMeeting({ ...base, calendarId: otherCalendar.id, leadId: third!.lead.id }),
      ]);
      const kinds = outcomes.map((o) => o.kind).sort();
      expect(kinds).toEqual(['BOOKED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_REUSED']);
    }
  });

  it('M4: identical concurrent requests are still replays', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const request = {
      organizationId: orgA,
      calendarId: calendar.id,
      leadId: lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    };
    const kinds = (await Promise.all([1, 2, 3, 4].map(() => booking.bookMeeting(request))))
      .map((o) => o.kind)
      .sort();
    expect(kinds).toEqual(['BOOKED', 'REPLAYED', 'REPLAYED', 'REPLAYED']);
  });

  it('M5: history references only existing meetings of the same organization and its content is immutable', async () => {
    const calendarB = await createWeekdayCalendar(tdb.db, { organizationId: orgB });
    const leadB = await createSyntheticLead(tdb.db, orgB);
    const foreign = await booking.bookMeeting({
      organizationId: orgB,
      calendarId: calendarB.id,
      leadId: leadB.lead.id,
      startsAt: TUESDAY_10,
      idempotencyKey: key(),
      actor: USER,
    });
    if (foreign.kind !== 'BOOKED') throw new Error(foreign.kind);
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const row = {
      organizationId: orgA,
      leadId: lead.id,
      toStatus: 'QUALIFIED' as const,
      origin: 'MANUAL' as const,
      actorType: 'USER' as const,
      actorId: 'u',
    };
    const fk = { kind: 'FOREIGN_KEY_VIOLATION', constraint: 'lead_status_changes_meeting_org_fk' };
    expect(
      await failureOf(tdb.db.insert(leadStatusChanges).values({ ...row, meetingId: randomUUID() })),
    ).toEqual(fk);
    expect(
      await failureOf(
        tdb.db.insert(leadStatusChanges).values({ ...row, meetingId: foreign.meeting.id }),
      ),
    ).toEqual(fk);
    const update = tdb.db
      .update(leadStatusChanges)
      .set({ reason: 'reescrito' })
      .where(eq(leadStatusChanges.leadId, lead.id));
    expect(await failureOf(update)).toEqual({ kind: 'INVARIANT_GUARD', constraint: null });
  });

  it('rolls back everything when a failure happens inside the booking transaction', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    await tdb.db.execute(
      sql.raw(`
      CREATE FUNCTION e1_fail_meeting_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'meeting.booked' THEN RAISE EXCEPTION 'induced failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER e1_fail_meeting_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION e1_fail_meeting_audit();
    `),
    );
    try {
      const attempt = booking.bookMeeting({
        organizationId: orgA,
        calendarId: calendar.id,
        leadId: lead.id,
        startsAt: TUESDAY_10,
        idempotencyKey: key(),
        actor: USER,
      });
      await expect(attempt).rejects.toThrow();
    } finally {
      await tdb.db.execute(
        sql.raw(
          'DROP TRIGGER e1_fail_meeting_audit ON audit_logs; DROP FUNCTION e1_fail_meeting_audit();',
        ),
      );
    }
    expect(await tdb.db.select().from(meetings).where(eq(meetings.leadId, lead.id))).toHaveLength(
      0,
    );
    const view = await leads.getLead(orgA, lead.id);
    expect([view!.status, view!.statusVersion, view!.history.length]).toEqual(['NEW', 1, 1]);
  });
});
