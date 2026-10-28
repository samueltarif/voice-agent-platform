import { describe, expect, it } from 'vitest';
import { getStartOfDayInTimezone, isValidIanaTimezone } from './date-timezone-boundary.js';
import { provisionOutboundBudgetLedgerInputSchema } from './outbound-budget-operations.js';

/** Quota diária (008-OF3): a janela começa na meia-noite LOCAL, inclusive em dias de DST. */
describe('getStartOfDayInTimezone across DST transitions', () => {
  it.each([
    // Sydney: DST termina 2026-04-05 03:00 local (AEDT +11 -> AEST +10).
    ['Australia/Sydney', '2026-04-05T10:00:00Z', '2026-04-04T13:00:00.000Z'],
    // Sydney: DST começa 2026-10-04 02:00 local (AEST +10 -> AEDT +11).
    ['Australia/Sydney', '2026-10-04T10:00:00Z', '2026-10-03T14:00:00.000Z'],
    // Nova York: DST começa 2026-03-08 e termina 2026-11-01.
    ['America/New_York', '2026-03-08T20:00:00Z', '2026-03-08T05:00:00.000Z'],
    ['America/New_York', '2026-11-01T20:00:00Z', '2026-11-01T04:00:00.000Z'],
    ['America/Sao_Paulo', '2026-10-28T02:59:59Z', '2026-10-27T03:00:00.000Z'],
    ['America/Sao_Paulo', '2026-10-28T03:00:00Z', '2026-10-28T03:00:00.000Z'],
  ])('%s at %s starts the local day at %s', (timeZone, at, expected) => {
    expect(getStartOfDayInTimezone(new Date(at), timeZone).toISOString()).toBe(expected);
  });

  it('fails closed on an unknown timezone instead of silently using UTC', () => {
    expect(() => getStartOfDayInTimezone(new Date(), 'Mars/Olympus_Mons')).toThrow(RangeError);
    expect(isValidIanaTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidIanaTimezone('America/Sao_Paulo')).toBe(true);
  });

  it('rejects ledger provisioning with an unknown timezone', () => {
    const parsed = provisionOutboundBudgetLedgerInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      allocatedBudgetMinorUnits: 100,
      timezone: 'Not/AZone',
    });
    expect(parsed.success).toBe(false);
  });
});
