import { describe, expect, it } from 'vitest';
import {
  evaluateLeadStatusChange,
  initialLeadStatus,
  LEAD_STATUSES,
  leadStatusAfterCancellation,
} from './lead-status.js';

describe('E1 lead status transitions', () => {
  it('starts NEW, or DO_NOT_CALL when the phone is already suppressed', () => {
    expect(initialLeadStatus(false)).toBe('NEW');
    expect(initialLeadStatus(true)).toBe('DO_NOT_CALL');
  });

  it('allows manual progression among open statuses only', () => {
    const allowed = [
      ['NEW', 'CONTACTED'],
      ['NEW', 'QUALIFIED'],
      ['CONTACTED', 'NOT_INTERESTED'],
      ['NOT_INTERESTED', 'QUALIFIED'],
    ] as const;
    for (const [from, to] of allowed) {
      expect(evaluateLeadStatusChange({ from, to, origin: 'MANUAL' })).toEqual({ ok: true });
    }
    expect(evaluateLeadStatusChange({ from: 'CONTACTED', to: 'NEW', origin: 'MANUAL' })).toEqual({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
    // DO_NOT_CALL só chega pelo opt-out (que sempre grava a supressão).
    expect(
      evaluateLeadStatusChange({ from: 'QUALIFIED', to: 'DO_NOT_CALL', origin: 'MANUAL' }),
    ).toEqual({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
  });

  it('never lets a manual change enter or leave MEETING_SCHEDULED, nor leave DO_NOT_CALL', () => {
    expect(
      evaluateLeadStatusChange({ from: 'QUALIFIED', to: 'MEETING_SCHEDULED', origin: 'MANUAL' }),
    ).toEqual({
      ok: false,
      reason: 'STATUS_MANAGED_BY_SCHEDULING',
    });
    for (const to of ['QUALIFIED', 'NOT_INTERESTED'] as const) {
      expect(evaluateLeadStatusChange({ from: 'MEETING_SCHEDULED', to, origin: 'MANUAL' })).toEqual(
        {
          ok: false,
          reason: 'STATUS_MANAGED_BY_SCHEDULING',
        },
      );
    }
    for (const to of LEAD_STATUSES.filter((status) => status !== 'DO_NOT_CALL')) {
      expect(evaluateLeadStatusChange({ from: 'DO_NOT_CALL', to, origin: 'MANUAL' })).toEqual({
        ok: false,
        reason: 'LEAD_DO_NOT_CALL',
      });
    }
  });

  it('opt-out moves open leads to DO_NOT_CALL and preserves an active meeting', () => {
    expect(evaluateLeadStatusChange({ from: 'NEW', to: 'DO_NOT_CALL', origin: 'OPT_OUT' })).toEqual(
      { ok: true },
    );
    expect(
      evaluateLeadStatusChange({ from: 'MEETING_SCHEDULED', to: 'DO_NOT_CALL', origin: 'OPT_OUT' }),
    ).toEqual({
      ok: false,
      reason: 'ACTIVE_MEETING_PRESERVED',
    });
    expect(
      evaluateLeadStatusChange({ from: 'DO_NOT_CALL', to: 'DO_NOT_CALL', origin: 'OPT_OUT' }),
    ).toEqual({
      ok: false,
      reason: 'SAME_STATUS',
    });
  });

  it('only booking reaches MEETING_SCHEDULED and cancellation returns to QUALIFIED or DO_NOT_CALL', () => {
    expect(
      evaluateLeadStatusChange({ from: 'NEW', to: 'MEETING_SCHEDULED', origin: 'MEETING_BOOKED' }),
    ).toEqual({ ok: true });
    // Reunião pedida pelo próprio cliente, registrada por usuário: a supressão continua.
    expect(
      evaluateLeadStatusChange({
        from: 'DO_NOT_CALL',
        to: 'MEETING_SCHEDULED',
        origin: 'MEETING_BOOKED',
      }),
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
      evaluateLeadStatusChange({
        from: 'MEETING_SCHEDULED',
        to: 'DO_NOT_CALL',
        origin: 'MEETING_CANCELED',
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateLeadStatusChange({ from: 'QUALIFIED', to: 'NEW', origin: 'MEETING_CANCELED' }),
    ).toEqual({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
    expect([leadStatusAfterCancellation(false), leadStatusAfterCancellation(true)]).toEqual([
      'QUALIFIED',
      'DO_NOT_CALL',
    ]);
  });
});
