import { describe, expect, it } from 'vitest';
import { applyOutboundAttemptEvent } from './apply-outbound-attempt-event.js';
import {
  FIXTURE_IDS,
  buildFixtureAttempt,
  buildFixtureEvent,
} from './outbound-attempt-fixtures.js';

const OTHER_ID = '99999999-9999-4999-8999-999999999999';

describe('tenant, attempt, job and session isolation', () => {
  it('rejects events from another organization without touching state', () => {
    const attempt = buildFixtureAttempt();
    const event = {
      ...buildFixtureEvent(attempt, 'INTENT_RECORDED'),
      organizationId: FIXTURE_IDS.orgB,
    };
    const result = applyOutboundAttemptEvent(attempt, event);
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'TENANT_MISMATCH' });
    expect(result.attempt).toBe(attempt);
  });

  it('does not leak DUPLICATE/STALE signals across tenants', () => {
    const attempt = buildFixtureAttempt({ state: 'ORIGINATION_ACCEPTED' });
    const own = buildFixtureEvent(attempt, 'INTENT_RECORDED');
    const withKnownId = buildFixtureAttempt({
      state: 'ORIGINATION_ACCEPTED',
      appliedEventIds: [own.eventId],
    });
    const foreign = { ...own, organizationId: FIXTURE_IDS.orgB };
    expect(applyOutboundAttemptEvent(withKnownId, foreign)).toMatchObject({
      kind: 'REJECTED',
      reason: 'TENANT_MISMATCH',
    });
  });

  it('rejects events for another attempt or another job of the same tenant', () => {
    const attempt = buildFixtureAttempt();
    const otherAttempt = { ...buildFixtureEvent(attempt, 'INTENT_RECORDED'), attemptId: OTHER_ID };
    const otherJob = { ...buildFixtureEvent(attempt, 'INTENT_RECORDED'), jobId: OTHER_ID };
    expect(applyOutboundAttemptEvent(attempt, otherAttempt)).toMatchObject({
      reason: 'ATTEMPT_MISMATCH',
    });
    expect(applyOutboundAttemptEvent(attempt, otherJob)).toMatchObject({ reason: 'JOB_MISMATCH' });
  });

  it('binds the call session on acceptance and rejects a different session afterwards', () => {
    const sent = buildFixtureAttempt({ state: 'ORIGINATION_SENT', originationAuthorityId: 'a' });
    const accepted = applyOutboundAttemptEvent(
      sent,
      buildFixtureEvent(sent, 'ORIGINATION_ACCEPTED', { callSessionId: FIXTURE_IDS.session }),
    );
    if (accepted.kind !== 'APPLIED') throw new Error('expected APPLIED');
    expect(accepted.attempt.callSessionId).toBe(FIXTURE_IDS.session);

    const foreignClose = applyOutboundAttemptEvent(
      accepted.attempt,
      buildFixtureEvent(accepted.attempt, 'CALL_CLOSED_CONFIRMED', { callSessionId: OTHER_ID }),
    );
    expect(foreignClose).toMatchObject({ kind: 'REJECTED', reason: 'SESSION_MISMATCH' });
    expect(foreignClose.attempt.state).toBe('ORIGINATION_ACCEPTED');
  });

  it('never binds a session from events that are not origination responses', () => {
    const sent = buildFixtureAttempt({ state: 'ORIGINATION_SENT' });
    const result = applyOutboundAttemptEvent(
      sent,
      buildFixtureEvent(sent, 'ORIGINATION_RESULT_UNKNOWN', { callSessionId: FIXTURE_IDS.session }),
    );
    if (result.kind !== 'APPLIED') throw new Error('expected APPLIED');
    expect(result.attempt.callSessionId).toBeNull();
  });

  it('rejects unknown extra fields in events (strict schema)', () => {
    const attempt = buildFixtureAttempt();
    const event = { ...buildFixtureEvent(attempt, 'INTENT_RECORDED'), rawProviderPayload: {} };
    expect(applyOutboundAttemptEvent(attempt, event)).toMatchObject({ reason: 'INVALID_EVENT' });
  });
});
