import { describe, expect, it } from 'vitest';
import {
  addDaysToLocalDate,
  isoWeekdayOf,
  isValidLocalDate,
  localDateOf,
  localMinuteOf,
  zonedWallTimeToInstant,
} from './zoned-wall-time.js';

const iso = (value: Date | null) => value?.toISOString() ?? null;

describe('E1 zoned wall time (IANA, DST-safe)', () => {
  it('converts São Paulo local time (UTC−3, no DST since 2019)', () => {
    expect(iso(zonedWallTimeToInstant('2026-12-01', 9 * 60, 'America/Sao_Paulo'))).toBe(
      '2026-12-01T12:00:00.000Z',
    );
    expect(iso(zonedWallTimeToInstant('2026-07-01', 9 * 60, 'America/Sao_Paulo'))).toBe(
      '2026-07-01T12:00:00.000Z',
    );
  });

  it('returns null for a local time skipped by spring-forward (New York, 2026-03-08 02:30)', () => {
    expect(zonedWallTimeToInstant('2026-03-08', 150, 'America/New_York')).toBeNull();
    expect(iso(zonedWallTimeToInstant('2026-03-08', 180, 'America/New_York'))).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('chooses the FIRST occurrence of an ambiguous fall-back time in both hemispheres of UTC', () => {
    // New York: 01:30 occurs at EDT (05:30Z) and again at EST (06:30Z).
    expect(iso(zonedWallTimeToInstant('2026-11-01', 90, 'America/New_York'))).toBe(
      '2026-11-01T05:30:00.000Z',
    );
    // Lisbon: 01:30 occurs at WEST (00:30Z) and again at WET (01:30Z).
    expect(iso(zonedWallTimeToInstant('2026-10-25', 90, 'Europe/Lisbon'))).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('maps 24:00 to the next local midnight and rejects out-of-range minutes', () => {
    expect(iso(zonedWallTimeToInstant('2026-12-01', 1440, 'America/Sao_Paulo'))).toBe(
      '2026-12-02T03:00:00.000Z',
    );
    expect(() => zonedWallTimeToInstant('2026-12-01', 1441, 'America/Sao_Paulo')).toThrow(
      RangeError,
    );
    expect(() => zonedWallTimeToInstant('2026-12-01', 1.5, 'America/Sao_Paulo')).toThrow(
      RangeError,
    );
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('26-01-01')).toBe(false);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(() => zonedWallTimeToInstant('2026-02-30', 0, 'UTC')).toThrow(RangeError);
  });

  it('reads local date, minute and ISO weekday of instants', () => {
    const instant = new Date('2026-12-01T02:30:00.000Z');
    expect(localDateOf(instant, 'America/Sao_Paulo')).toBe('2026-11-30');
    expect(localMinuteOf(instant, 'America/Sao_Paulo')).toBe(23 * 60 + 30);
    expect(isoWeekdayOf('2026-11-30')).toBe(1);
    expect(isoWeekdayOf('2026-11-29')).toBe(7);
    expect(addDaysToLocalDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
