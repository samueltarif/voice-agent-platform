import { describe, expect, it } from 'vitest';
import { evaluateLeadStatusChange, initialLeadStatus, LEAD_STATUSES } from './lead-status.js';

describe('E1 lead status transitions', () => {
  it('starts NEW, or DO_NOT_CALL when the phone is already suppressed', () => {
    expect(initialLeadStatus(false)).toBe('NEW');
    expect(initialLeadStatus(true)).toBe('DO_NOT_CALL');
  });

  it('allows manual progression among open statuses and to DO_NOT_CALL', () => {
    const allowed = [
      ['NEW', 'CONTACTED'],
      ['NEW', 'QUALIFIED'],
      ['CONTACTED', 'NOT_INTERESTED'],
      ['NOT_INTERESTED', 'QUALIFIED'],
      ['QUALIFIED', 'DO_NOT_CALL'],
    ] as const;
    for (const [from, to] of allowed) {
      expect(evaluateLeadStatusChange({ from, to, origin: 'MANUAL' })).toEqual({ ok: true });
    }
    expect(evaluateLeadStatusChange({ from: 'CONTACTED', to: 'NEW', origin: 'MANUAL' })).toEqual({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
  });

  it('never lets a manual change enter or leave MEETING_SCHEDULED', () => {
    expect(
      evaluateLeadStatusChange({ from: 'QUALIFIED', to: 'MEETING_SCHEDULED', origin: 'MANUAL' }),
    ).toEqual({
      ok: false,
      reason: 'STATUS_MANAGED_BY_SCHEDULING',
    });
    for (const to of ['QUALIFIED', 'NOT_INTERESTED', 'DO_NOT_CALL'] as const) {
      expect(evaluateLeadStatusChange({ from: 'MEETING_SCHEDULED', to, origin: 'MANUAL' })).toEqual(
        {
          ok: false,
          reason: 'STATUS_MANAGED_BY_SCHEDULING',
        },
      );
    }
  });

  it('only booking reaches MEETING_SCHEDULED and only cancellation leaves it (to QUALIFIED)', () => {
    expect(
      evaluateLeadStatusChange({ from: 'NEW', to: 'MEETING_SCHEDULED', origin: 'MEETING_BOOKED' }),
    ).toEqual({ ok: true });
    expect(
      evaluateLeadStatusChange({
        from: 'MEETING_SCHEDULED',
        to: 'MEETING_SCHEDULED',
        origin: 'MEETING_BOOKED',
      }),
    ).toEqual({
      ok: false,
      reason: 'SAME_STATUS',
    });
    expect(
      evaluateLeadStatusChange({
        from: 'MEETING_SCHEDULED',
        to: 'QUALIFIED',
        origin: 'MEETING_CANCELED',
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateLeadStatusChange({ from: 'QUALIFIED', to: 'NEW', origin: 'MEETING_CANCELED' }),
    ).toEqual({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
  });

  it('treats DO_NOT_CALL as terminal for every origin and target', () => {
    for (const to of LEAD_STATUSES) {
      for (const origin of ['MANUAL', 'MEETING_BOOKED', 'MEETING_CANCELED'] as const) {
        expect(evaluateLeadStatusChange({ from: 'DO_NOT_CALL', to, origin })).toEqual({
          ok: false,
          reason: 'LEAD_DO_NOT_CALL',
        });
      }
    }
  });
});
