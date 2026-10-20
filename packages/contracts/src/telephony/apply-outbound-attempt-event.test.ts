import { describe, expect, it } from 'vitest';
import { applyOutboundAttemptEvent } from './apply-outbound-attempt-event.js';
import { buildFixtureAttempt, buildFixtureEvent } from './outbound-attempt-fixtures.js';
import type { OutboundAttempt } from './outbound-attempt.js';
import type { OutboundAttemptEventType } from './outbound-attempt-event.js';
import type { OutboundAttemptState } from './outbound-attempt-state.js';

function applyApplied(attempt: OutboundAttempt, type: OutboundAttemptEventType, extra = {}) {
  const result = applyOutboundAttemptEvent(attempt, buildFixtureEvent(attempt, type, extra));
  if (result.kind !== 'APPLIED') {
    throw new Error(`expected APPLIED for ${type}, got ${result.kind}`);
  }
  return result.attempt;
}

function inState(state: OutboundAttemptState, extra: Partial<OutboundAttempt> = {}) {
  return buildFixtureAttempt({ state, ...extra });
}

describe('valid transitions (happy paths)', () => {
  it('walks CREATED -> PENDING -> SENT -> ACCEPTED -> CLOSED', () => {
    let a = buildFixtureAttempt();
    a = applyApplied(a, 'INTENT_RECORDED');
    expect(a.state).toBe('ORIGINATION_PENDING');
    a = applyApplied(a, 'SEND_STARTED');
    expect(a.state).toBe('ORIGINATION_SENT');
    expect(a.originationAuthorityId).toBe('authority-1');
    a = applyApplied(a, 'ORIGINATION_ACCEPTED', { providerReference: 'opaque-ref' });
    expect(a.state).toBe('ORIGINATION_ACCEPTED');
    expect(a.providerReference).toBe('opaque-ref');
    a = applyApplied(a, 'CALL_CLOSED_CONFIRMED');
    expect(a.state).toBe('CLOSED');
  });

  it('SENT -> REJECTED is terminal and keeps the reason out of the state', () => {
    const a = applyApplied(inState('ORIGINATION_SENT'), 'ORIGINATION_REJECTED');
    expect(a.state).toBe('ORIGINATION_REJECTED');
  });

  it('cancels only before any send', () => {
    expect(applyApplied(inState('CREATED'), 'CANCEL_REQUESTED').state).toBe('CANCELED');
    expect(applyApplied(inState('ORIGINATION_PENDING'), 'CANCEL_REQUESTED').state).toBe('CANCELED');
    const sent = inState('ORIGINATION_SENT');
    const result = applyOutboundAttemptEvent(sent, buildFixtureEvent(sent, 'CANCEL_REQUESTED'));
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'INVALID_TRANSITION' });
  });

  it('does not mutate the input attempt', () => {
    const before = buildFixtureAttempt();
    const snapshot = JSON.stringify(before);
    applyOutboundAttemptEvent(before, buildFixtureEvent(before, 'INTENT_RECORDED'));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('invalid transitions are rejected deterministically', () => {
  it('rejects skipping the intent step', () => {
    const a = buildFixtureAttempt();
    for (const type of ['SEND_STARTED', 'ORIGINATION_ACCEPTED', 'CALL_CLOSED_CONFIRMED'] as const) {
      const result = applyOutboundAttemptEvent(a, buildFixtureEvent(a, type));
      expect(result).toMatchObject({ kind: 'REJECTED', reason: 'INVALID_TRANSITION' });
      expect(result.attempt).toBe(a);
    }
  });

  it('rejects crash recovery for an attempt that was never sent', () => {
    const a = inState('ORIGINATION_PENDING');
    const result = applyOutboundAttemptEvent(a, buildFixtureEvent(a, 'CRASH_RECOVERY_DETECTED'));
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'INVALID_TRANSITION' });
  });

  it('rejects malformed events without throwing', () => {
    const a = buildFixtureAttempt();
    const bad = { ...buildFixtureEvent(a, 'INTENT_RECORDED'), eventId: 'not-a-uuid' };
    expect(applyOutboundAttemptEvent(a, bad)).toMatchObject({
      kind: 'REJECTED',
      reason: 'INVALID_EVENT',
    });
    expect(applyOutboundAttemptEvent(a, { type: 'NOPE' } as never)).toMatchObject({
      kind: 'REJECTED',
      reason: 'INVALID_EVENT',
    });
  });
});

describe('terminal states never return to active states', () => {
  const terminals: OutboundAttemptState[] = [
    'ORIGINATION_REJECTED',
    'NOT_ORIGINATED',
    'CLOSED',
    'CANCELED',
  ];
  const activating: OutboundAttemptEventType[] = [
    'SEND_STARTED',
    'RECONCILIATION_REQUESTED',
    'RECONCILIATION_INCONCLUSIVE',
    'RECONCILIATION_TIMED_OUT',
    'CRASH_RECOVERY_DETECTED',
    'ORIGINATION_RESULT_UNKNOWN',
  ];

  it.each(terminals)('%s ignores or rejects every event that would reactivate it', (state) => {
    const a = inState(state);
    for (const type of activating) {
      const result = applyOutboundAttemptEvent(a, buildFixtureEvent(a, type));
      expect(result.attempt.state).toBe(state);
      expect(['STALE', 'REJECTED']).toContain(result.kind);
    }
  });

  it('flags contradictory confirmations after a terminal decision', () => {
    const notOriginated = inState('NOT_ORIGINATED');
    const result = applyOutboundAttemptEvent(
      notOriginated,
      buildFixtureEvent(notOriginated, 'ORIGINATION_ACCEPTED'),
    );
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'TERMINAL_STATE_CONFLICT' });
    expect(result.attempt.state).toBe('NOT_ORIGINATED');
  });
});

describe('unknown outcome and reconciliation', () => {
  it('failure after send is OUTCOME_UNKNOWN, not a failed call', () => {
    const a = applyApplied(inState('ORIGINATION_SENT'), 'ORIGINATION_RESULT_UNKNOWN');
    expect(a.state).toBe('OUTCOME_UNKNOWN');
  });

  it('crash recovery turns SENT into OUTCOME_UNKNOWN', () => {
    const a = applyApplied(inState('ORIGINATION_SENT'), 'CRASH_RECOVERY_DETECTED');
    expect(a.state).toBe('OUTCOME_UNKNOWN');
  });

  it('reconciliation can confirm origination, non-origination or stay inconclusive', () => {
    const unknown = inState('OUTCOME_UNKNOWN');
    const requested = applyApplied(unknown, 'RECONCILIATION_REQUESTED');
    expect(requested.state).toBe('RECONCILIATION_PENDING');
    expect(applyApplied(requested, 'RECONCILIATION_CONFIRMED_ORIGINATED').state).toBe(
      'ORIGINATION_ACCEPTED',
    );
    expect(applyApplied(requested, 'RECONCILIATION_CONFIRMED_NOT_ORIGINATED').state).toBe(
      'NOT_ORIGINATED',
    );
    const inconclusive = applyApplied(requested, 'RECONCILIATION_INCONCLUSIVE');
    expect(inconclusive.state).toBe('OUTCOME_UNKNOWN');
    expect(inconclusive.reconciliationAttempts).toBe(1);
  });

  it('reconciliation timeout keeps the attempt unresolved and flags manual review', () => {
    const a = applyApplied(inState('RECONCILIATION_PENDING'), 'RECONCILIATION_TIMED_OUT');
    expect(a.state).toBe('OUTCOME_UNKNOWN');
    expect(a.requiresManualReview).toBe(true);
  });

  it('late acceptance or closure resolves an unknown outcome', () => {
    expect(applyApplied(inState('OUTCOME_UNKNOWN'), 'ORIGINATION_ACCEPTED').state).toBe(
      'ORIGINATION_ACCEPTED',
    );
    expect(applyApplied(inState('OUTCOME_UNKNOWN'), 'CALL_CLOSED_CONFIRMED').state).toBe('CLOSED');
    expect(applyApplied(inState('OUTCOME_UNKNOWN'), 'ORIGINATION_REJECTED').state).toBe(
      'ORIGINATION_REJECTED',
    );
  });
});

describe('duplicate and out-of-order events', () => {
  it('same eventId is a DUPLICATE with no state change', () => {
    const a = buildFixtureAttempt();
    const event = buildFixtureEvent(a, 'INTENT_RECORDED');
    const first = applyOutboundAttemptEvent(a, event);
    if (first.kind !== 'APPLIED') throw new Error('expected APPLIED');
    const again = applyOutboundAttemptEvent(first.attempt, event);
    expect(again.kind).toBe('DUPLICATE');
    expect(again.attempt).toBe(first.attempt);
    expect(first.attempt.appliedEventIds).toEqual([event.eventId]);
  });

  it('a late event for a step already passed is STALE, not an error', () => {
    const accepted = inState('ORIGINATION_ACCEPTED');
    const late = applyOutboundAttemptEvent(
      accepted,
      buildFixtureEvent(accepted, 'INTENT_RECORDED'),
    );
    expect(late.kind).toBe('STALE');
    const unknown = applyOutboundAttemptEvent(
      accepted,
      buildFixtureEvent(accepted, 'ORIGINATION_RESULT_UNKNOWN'),
    );
    expect(unknown.kind).toBe('STALE');
    expect(unknown.attempt.state).toBe('ORIGINATION_ACCEPTED');
  });

  it('delivers accept-before-unknown consistently regardless of order', () => {
    const sent = inState('ORIGINATION_SENT');
    const accepted = applyApplied(sent, 'ORIGINATION_ACCEPTED');
    const lateUnknown = applyOutboundAttemptEvent(
      accepted,
      buildFixtureEvent(accepted, 'ORIGINATION_RESULT_UNKNOWN'),
    );
    expect(lateUnknown.attempt.state).toBe('ORIGINATION_ACCEPTED');
  });
});

describe('single origination authority', () => {
  it('rejects a second authority claiming the same attempt', () => {
    const sent = inState('ORIGINATION_SENT', { originationAuthorityId: 'authority-1' });
    const result = applyOutboundAttemptEvent(
      sent,
      buildFixtureEvent(sent, 'SEND_STARTED', { authorityId: 'authority-2' }),
    );
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'AUTHORITY_CONFLICT' });
  });

  it('treats a repeated claim by the same authority as STALE', () => {
    const sent = inState('ORIGINATION_SENT', { originationAuthorityId: 'authority-1' });
    const result = applyOutboundAttemptEvent(sent, buildFixtureEvent(sent, 'SEND_STARTED'));
    expect(result.kind).toBe('STALE');
  });

  it('rejects conflicting provider references for the same attempt', () => {
    const accepted = inState('ORIGINATION_ACCEPTED', { providerReference: 'ref-1' });
    const result = applyOutboundAttemptEvent(
      accepted,
      buildFixtureEvent(accepted, 'ORIGINATION_ACCEPTED', { providerReference: 'ref-2' }),
    );
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'PROVIDER_REFERENCE_CONFLICT' });
  });
});
