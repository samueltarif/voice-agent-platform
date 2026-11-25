import { describe, expect, it } from 'vitest';
import {
  listAvailableSlots,
  type SchedulingCalendarSnapshot,
  type TimeInterval,
} from './slot-generation.js';
import { evaluateSlotBookability } from './slot-bookability.js';

const policy = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 30,
};
// Segunda a sexta, 09:00–12:00 (horário de São Paulo).
const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 720 }));
const calendar: SchedulingCalendarSnapshot = { policy, rules: weekdays, exceptions: [] };
// Domingo 29/11/2026 20:00 em São Paulo.
const now = new Date('2026-11-29T23:00:00.000Z');
const at = (value: string) => new Date(value);
const starts = (slots: { startsAt: Date }[]) => slots.map((slot) => slot.startsAt.toISOString());

describe('E1 slot generation', () => {
  it('lists the weekday grid in the calendar timezone, skipping the weekend', () => {
    const slots = listAvailableSlots({
      calendar,
      busy: [],
      now,
      from: at('2026-11-28T03:00:00.000Z'),
      to: at('2026-12-01T03:00:00.000Z'),
      limit: 50,
    });
    expect(slots).toHaveLength(6);
    expect(starts(slots)[0]).toBe('2026-11-30T12:00:00.000Z');
    expect(starts(slots)[5]).toBe('2026-11-30T14:30:00.000Z');
  });

  it('applies minimum notice, horizon, limit, exceptions and buffer around busy meetings', () => {
    const withRules: SchedulingCalendarSnapshot = {
      policy: { ...policy, bufferMinutes: 15 },
      rules: weekdays,
      exceptions: [
        { localDate: '2026-12-01', kind: 'UNAVAILABLE', window: null },
        {
          localDate: '2026-12-05',
          kind: 'AVAILABLE',
          window: { startMinute: 600, endMinute: 660 },
        },
      ],
    };
    const slots = listAvailableSlots({
      calendar: withRules,
      busy: [{ startsAt: at('2026-11-30T13:00:00.000Z'), endsAt: at('2026-11-30T13:30:00.000Z') }],
      now: at('2026-11-30T11:30:00.000Z'), // 08:30 local; notice 60 min → 09:30
      from: at('2026-11-30T03:00:00.000Z'),
      to: at('2026-12-06T03:00:00.000Z'),
      limit: 100,
    });
    const list = starts(slots);
    expect(list).not.toContain('2026-11-30T12:00:00.000Z'); // dentro da antecedência
    expect(list).not.toContain('2026-11-30T12:30:00.000Z'); // buffer antes da reunião
    expect(list).not.toContain('2026-11-30T13:30:00.000Z'); // buffer depois da reunião
    expect(list).toContain('2026-11-30T14:00:00.000Z');
    expect(list.some((value) => value.startsWith('2026-12-01'))).toBe(false); // dia bloqueado
    expect(list).toContain('2026-12-05T13:00:00.000Z'); // sábado extra 10:00
    expect(
      listAvailableSlots({
        calendar,
        busy: [],
        now,
        from: now,
        to: at('2027-06-01T00:00:00Z'),
        limit: 3,
      }),
    ).toHaveLength(3);
    const beyond = listAvailableSlots({
      calendar,
      busy: [],
      now,
      from: at('2027-01-04T03:00:00Z'),
      to: at('2027-01-09T03:00:00Z'),
      limit: 10,
    });
    expect(beyond).toEqual([]);
  });

  it('keeps wall-clock slots across a DST change (New York, week of 2026-11-01)', () => {
    const ny: SchedulingCalendarSnapshot = {
      policy: { ...policy, timezone: 'America/New_York', minimumNoticeMinutes: 0 },
      rules: [5, 1].map((weekday) => ({ weekday, startMinute: 540, endMinute: 570 })),
      exceptions: [],
    };
    const slots = listAvailableSlots({
      calendar: ny,
      busy: [],
      now: at('2026-10-29T00:00:00.000Z'),
      from: at('2026-10-29T00:00:00.000Z'),
      to: at('2026-11-03T00:00:00.000Z'),
      limit: 10,
    });
    // Sexta 30/10 09:00 EDT (13:00Z) e segunda 02/11 09:00 EST (14:00Z).
    expect(starts(slots)).toEqual(['2026-10-30T13:00:00.000Z', '2026-11-02T14:00:00.000Z']);
  });
});

describe('E1 slot bookability (authoritative re-check)', () => {
  const base = { calendar, busy: [] as TimeInterval[], now };
  it('accepts exactly one grid start and rejects everything else with a reason', () => {
    expect(evaluateSlotBookability({ ...base, startsAt: at('2026-11-30T12:30:00.000Z') }).ok).toBe(
      true,
    );
    const reasonOf = (startsAt: Date, busy = base.busy) => {
      const verdict = evaluateSlotBookability({ ...base, busy, startsAt });
      return verdict.ok ? 'OK' : verdict.reason;
    };
    expect(reasonOf(at('invalid'))).toBe('INVALID_START');
    expect(reasonOf(at('2026-11-29T23:30:00.000Z'))).toBe('INSIDE_MINIMUM_NOTICE');
    expect(reasonOf(at('2027-02-01T12:00:00.000Z'))).toBe('BEYOND_BOOKING_HORIZON');
    expect(reasonOf(at('2026-11-30T12:10:00.000Z'))).toBe('OUTSIDE_AVAILABILITY'); // fora da grade
    expect(reasonOf(at('2026-11-30T18:00:00.000Z'))).toBe('OUTSIDE_AVAILABILITY'); // 15:00 local
    expect(reasonOf(at('2026-12-05T12:00:00.000Z'))).toBe('OUTSIDE_AVAILABILITY'); // sábado
    const busy = [
      { startsAt: at('2026-11-30T12:15:00.000Z'), endsAt: at('2026-11-30T12:45:00.000Z') },
    ];
    expect(reasonOf(at('2026-11-30T12:30:00.000Z'), busy)).toBe('SLOT_CONFLICT');
  });
});
