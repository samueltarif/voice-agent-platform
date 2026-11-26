import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleSchedulingAvailabilityRepository } from './repositories/scheduling-availability-repository.js';
import { DrizzleSchedulingCalendarRepository } from './repositories/scheduling-calendar-repository.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
import { auditLogs } from './schema/audit.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createWeekdayCalendar,
  SAO_PAULO_POLICY,
  SCHEDULING_TEST_NOW,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('scheduling-calendars-e1');
const at = (value: string) => new Date(value);

/** E1 (DEC-074) — agendas, disponibilidade, exceções e horários livres (PostgreSQL). */
describe('E1 scheduling calendars', () => {
  const calendars = new DrizzleSchedulingCalendarRepository(tdb.db);
  const availability = new DrizzleSchedulingAvailabilityRepository(tdb.db);
  const slots = new DrizzleSchedulingSlotRepository(tdb.db);
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

  const base = { actor: SCHEDULING_TEST_USER };

  it('creates calendars with a unique name per organization', async () => {
    const created = await calendars.createCalendar({
      ...base,
      organizationId: orgA,
      name: 'Demonstrações',
      policy: SAO_PAULO_POLICY,
    });
    expect(created.kind).toBe('CREATED');
    expect(
      await calendars.createCalendar({
        ...base,
        organizationId: orgA,
        name: 'Demonstrações',
        policy: SAO_PAULO_POLICY,
      }),
    ).toEqual({ kind: 'NAME_TAKEN' });
    const otherTenant = await calendars.createCalendar({
      ...base,
      organizationId: orgB,
      name: 'Demonstrações',
      policy: SAO_PAULO_POLICY,
    });
    expect(otherTenant.kind).toBe('CREATED');
    expect((await calendars.listCalendars(orgB)).map((c) => c.name)).toEqual(['Demonstrações']);
  });

  it('versions policy and availability changes and audits each one', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    expect(calendar.version).toBe(2);
    const stale = await availability.replaceWeeklyAvailability({
      ...base,
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 1,
      rules: [],
    });
    expect(stale).toEqual({ kind: 'VERSION_CONFLICT' });
    const policy = await calendars.updatePolicy({
      ...base,
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      policy: { ...SAO_PAULO_POLICY, slotDurationMinutes: 60 },
    });
    expect(
      policy.kind === 'UPDATED' && [policy.calendar.version, policy.calendar.slotDurationMinutes],
    ).toEqual([3, 60]);
    const audit = await tdb.db.select().from(auditLogs).where(eq(auditLogs.targetId, calendar.id));
    expect(audit.map((a) => a.action).sort()).toEqual([
      'scheduling_calendar.availability_replaced',
      'scheduling_calendar.created',
      'scheduling_calendar.policy_updated',
    ]);
  });

  it('lists free slots in the calendar timezone and honours exceptions', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const added = await availability.addException({
      ...base,
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      exception: {
        localDate: '2026-12-01',
        kind: 'UNAVAILABLE',
        window: { startMinute: 540, endMinute: 660 },
        reason: 'Feriado interno',
      },
    });
    expect(added.kind).toBe('UPDATED');
    const query = {
      organizationId: orgA,
      calendarId: calendar.id,
      now: SCHEDULING_TEST_NOW,
      limit: 50,
    };
    const free = await slots.listSlots({
      ...query,
      from: at('2026-12-01T03:00:00Z'),
      to: at('2026-12-02T03:00:00Z'),
    });
    expect(free!.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-12-01T14:00:00.000Z',
      '2026-12-01T14:30:00.000Z',
    ]);
    const detail = await calendars.getCalendar(orgA, calendar.id);
    expect(detail!.exceptions).toHaveLength(1);
  });

  it('removes only exceptions of the same calendar and organization', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const other = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    await availability.addException({
      ...base,
      organizationId: orgA,
      calendarId: other.id,
      expectedVersion: 2,
      exception: { localDate: '2026-12-02', kind: 'UNAVAILABLE', window: null, reason: null },
    });
    const otherDetail = await calendars.getCalendar(orgA, other.id);
    const [exception] = await tdb.db.query.schedulingAvailabilityExceptions.findMany({
      where: (table, { eq: equals }) => equals(table.calendarId, other.id),
    });
    expect(otherDetail!.exceptions).toHaveLength(1);
    const wrongCalendar = await availability.removeException({
      ...base,
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      exceptionId: exception!.id,
    });
    expect(wrongCalendar).toEqual({ kind: 'NOT_FOUND' });
    expect((await calendars.getCalendar(orgA, calendar.id))!.calendar.version).toBe(2);
    const removed = await availability.removeException({
      ...base,
      organizationId: orgA,
      calendarId: other.id,
      expectedVersion: 3,
      exceptionId: exception!.id,
    });
    expect(removed.kind).toBe('UPDATED');
  });

  it('hides calendars of other organizations from reads, slots and writes', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    expect(await calendars.getCalendar(orgB, calendar.id)).toBeNull();
    expect(
      await slots.listSlots({
        organizationId: orgB,
        calendarId: calendar.id,
        now: SCHEDULING_TEST_NOW,
        from: SCHEDULING_TEST_NOW,
        to: at('2026-12-05T00:00:00Z'),
        limit: 5,
      }),
    ).toBeNull();
    const write = await availability.replaceWeeklyAvailability({
      ...base,
      organizationId: orgB,
      calendarId: calendar.id,
      expectedVersion: 2,
      rules: [],
    });
    expect(write).toEqual({ kind: 'NOT_FOUND' });
    expect((await calendars.getCalendar(orgA, calendar.id))!.rules).toHaveLength(5);
  });

  it('rejects invalid values at the database as a second barrier', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, { organizationId: orgA });
    const failing = availability.replaceWeeklyAvailability({
      ...base,
      organizationId: orgA,
      calendarId: calendar.id,
      expectedVersion: 2,
      rules: [{ weekday: 9, startMinute: 600, endMinute: 540 }],
    });
    await expect(failing).rejects.toThrow();
    expect((await calendars.getCalendar(orgA, calendar.id))!.calendar.version).toBe(2);
  });
});
