import { describe, expect, it } from 'vitest';
import { evaluateSuccessorAttempt } from './evaluate-successor-attempt.js';
import { FIXTURE_IDS, buildFixtureAttempt } from './outbound-attempt-fixtures.js';
import type { OutboundAttemptState } from './outbound-attempt-state.js';

const scope = { organizationId: FIXTURE_IDS.orgA, jobId: FIXTURE_IDS.job, maxAttempts: 3 };

function history(...states: OutboundAttemptState[]) {
  return states.map((state, index) =>
    buildFixtureAttempt({
      state,
      attemptNumber: index + 1,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
    }),
  );
}

describe('evaluateSuccessorAttempt', () => {
  it('allows the first attempt for an empty history', () => {
    expect(evaluateSuccessorAttempt([], scope)).toEqual({ allowed: true, nextAttemptNumber: 1 });
  });

  it.each(['ORIGINATION_REJECTED', 'NOT_ORIGINATED'] as const)(
    'allows a new attempt after a confirmed %s',
    (state) => {
      expect(evaluateSuccessorAttempt(history(state), scope)).toEqual({
        allowed: true,
        nextAttemptNumber: 2,
      });
    },
  );

  it.each(['OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING'] as const)(
    'blocks blind redial while %s',
    (state) => {
      expect(evaluateSuccessorAttempt(history(state), scope)).toEqual({
        allowed: false,
        reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL',
      });
    },
  );

  it('keeps blocking after reconciliation timeout (timeout is not authorization)', () => {
    const [unknown] = history('OUTCOME_UNKNOWN');
    const timedOut = { ...unknown!, requiresManualReview: true, reconciliationAttempts: 5 };
    expect(evaluateSuccessorAttempt([timedOut], scope)).toMatchObject({
      allowed: false,
      reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL',
    });
  });

  it.each(['CREATED', 'ORIGINATION_PENDING', 'ORIGINATION_SENT', 'ORIGINATION_ACCEPTED'] as const)(
    'blocks when an earlier attempt is still %s',
    (state) => {
      expect(evaluateSuccessorAttempt(history(state), scope)).toEqual({
        allowed: false,
        reason: 'ACTIVE_ATTEMPT_IN_PROGRESS',
      });
    },
  );

  it.each(['CLOSED', 'CANCELED'] as const)(
    'fails closed after %s (retry policy belongs to later slices)',
    (state) => {
      expect(evaluateSuccessorAttempt(history(state), scope)).toEqual({
        allowed: false,
        reason: 'PREVIOUS_ATTEMPT_NOT_RETRYABLE',
      });
    },
  );

  it('enforces max attempts', () => {
    const result = evaluateSuccessorAttempt(
      history('ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'ORIGINATION_REJECTED'),
      scope,
    );
    expect(result).toEqual({ allowed: false, reason: 'MAX_ATTEMPTS_REACHED' });
  });

  it('rejects histories from another tenant or job', () => {
    const foreign = [buildFixtureAttempt({ organizationId: FIXTURE_IDS.orgB })];
    expect(evaluateSuccessorAttempt(foreign, scope)).toEqual({
      allowed: false,
      reason: 'HISTORY_SCOPE_MISMATCH',
    });
    const otherJob = [buildFixtureAttempt({ jobId: '99999999-9999-4999-8999-999999999999' })];
    expect(evaluateSuccessorAttempt(otherJob, scope).allowed).toBe(false);
  });

  it('rejects inconsistent histories (gaps, duplicate ids or numbers)', () => {
    const [first, second] = history('ORIGINATION_REJECTED', 'ORIGINATION_REJECTED');
    const gap = [first!, { ...second!, attemptNumber: 3 }];
    expect(evaluateSuccessorAttempt(gap, scope)).toEqual({
      allowed: false,
      reason: 'HISTORY_INCONSISTENT',
    });
    const sameId = [first!, { ...second!, id: first!.id }];
    expect(evaluateSuccessorAttempt(sameId, scope).allowed).toBe(false);
  });

  it('does not depend on input order and never mutates the history', () => {
    const list = history('ORIGINATION_REJECTED', 'OUTCOME_UNKNOWN');
    const snapshot = JSON.stringify(list);
    const reversed = [...list].reverse();
    expect(evaluateSuccessorAttempt(reversed, scope)).toMatchObject({ allowed: false });
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it('rejects attemptId that already exists in history', () => {
    const [first] = history('ORIGINATION_REJECTED');
    const result = evaluateSuccessorAttempt([first!], { ...scope, attemptId: first!.id });
    expect(result).toEqual({ allowed: false, reason: 'ATTEMPT_ID_ALREADY_EXISTS' });
  });
});
