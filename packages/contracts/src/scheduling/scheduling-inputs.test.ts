import { describe, expect, it } from 'vitest';
import {
  bookMeetingInputSchema,
  createAvailabilityExceptionInputSchema,
  createCalendarInputSchema,
  replaceWeeklyAvailabilityInputSchema,
  slotQuerySchema,
} from './scheduling-inputs.js';
import { formatLocalTime, parseLocalTime } from './scheduling-policy.js';

const policy = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 10,
  minimumNoticeMinutes: 120,
  bookingHorizonDays: 30,
};

describe('E1 scheduling inputs', () => {
  it('validates the calendar policy, including the IANA timezone', () => {
    expect(createCalendarInputSchema.safeParse({ name: 'Demonstrações', ...policy }).success).toBe(
      true,
    );
    expect(
      createCalendarInputSchema.safeParse({ name: 'X', ...policy, timezone: 'Mars/Olympus' })
        .success,
    ).toBe(false);
    expect(
      createCalendarInputSchema.safeParse({ name: 'X', ...policy, slotDurationMinutes: 4 }).success,
    ).toBe(false);
    expect(createCalendarInputSchema.safeParse({ name: 'X', ...policy, extra: 1 }).success).toBe(
      false,
    );
  });

  it('parses weekly rules as minutes and rejects inverted or overlapping windows', () => {
    const parsed = replaceWeeklyAvailabilityInputSchema.parse({
      expectedVersion: 1,
      rules: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '24:00' },
      ],
    });
    expect(parsed.rules[1]).toEqual({ weekday: 1, startMinute: 840, endMinute: 1440 });
    const bad = (rules: unknown) =>
      replaceWeeklyAvailabilityInputSchema.safeParse({ expectedVersion: 1, rules }).success;
    expect(bad([{ weekday: 1, start: '12:00', end: '09:00' }])).toBe(false);
    expect(
      bad([
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '11:00', end: '13:00' },
      ]),
    ).toBe(false);
    expect(bad([{ weekday: 8, start: '09:00', end: '12:00' }])).toBe(false);
    expect(bad([{ weekday: 1, start: '9:00', end: '12:00' }])).toBe(false);
  });

  it('requires a window for AVAILABLE exceptions and accepts whole-day blocks', () => {
    expect(
      createAvailabilityExceptionInputSchema.safeParse({ date: '2026-12-25', kind: 'UNAVAILABLE' })
        .success,
    ).toBe(true);
    expect(
      createAvailabilityExceptionInputSchema.safeParse({ date: '2026-12-26', kind: 'AVAILABLE' })
        .success,
    ).toBe(false);
    expect(
      createAvailabilityExceptionInputSchema.safeParse({ date: '2026-02-30', kind: 'UNAVAILABLE' })
        .success,
    ).toBe(false);
    expect(
      createAvailabilityExceptionInputSchema.safeParse({
        date: '2026-12-26',
        kind: 'AVAILABLE',
        start: '10:00',
      }).success,
    ).toBe(false);
  });

  it('bounds slot queries and validates booking requests', () => {
    expect(
      slotQuerySchema.safeParse({ from: '2026-12-01T00:00:00Z', to: '2026-12-31T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(
      slotQuerySchema.safeParse({ from: '2026-12-01T00:00:00Z', to: '2027-02-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(
      slotQuerySchema.safeParse({ from: '2026-12-02T00:00:00Z', to: '2026-12-01T00:00:00Z' })
        .success,
    ).toBe(false);
    const booking = {
      calendarId: '6b1c1a49-6a0a-4f43-9a19-0a4c2b5d7e01',
      leadId: '6b1c1a49-6a0a-4f43-9a19-0a4c2b5d7e02',
      startsAt: '2026-12-01T12:00:00-03:00',
      idempotencyKey: 'ui-booking-0001',
    };
    expect(bookMeetingInputSchema.safeParse(booking).success).toBe(true);
    expect(bookMeetingInputSchema.safeParse({ ...booking, idempotencyKey: 'short' }).success).toBe(
      false,
    );
    expect(
      bookMeetingInputSchema.safeParse({ ...booking, startsAt: '2026-12-01 12:00' }).success,
    ).toBe(false);
  });

  it('round-trips local times', () => {
    expect(parseLocalTime('00:00')).toBe(0);
    expect(parseLocalTime('24:00')).toBe(1440);
    expect(formatLocalTime(570)).toBe('09:30');
    expect(() => parseLocalTime('24:30')).toThrow(RangeError);
  });
});
