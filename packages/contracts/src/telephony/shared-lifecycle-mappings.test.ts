import { describe, expect, it } from 'vitest';
import { originationEventOf, reconciliationEventOf } from './port-result-events.js';
import { isValidCallSessionStateTransition } from '../voice/call-session-transitions.js';

describe('shared mappings moved to contracts (behavior preserved)', () => {
  it('maps neutral port results to internal events', () => {
    expect(originationEventOf({ kind: 'ACCEPTED', providerReference: 'r' })).toEqual({
      type: 'ORIGINATION_ACCEPTED',
      extra: { providerReference: 'r' },
    });
    expect(originationEventOf({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' }).type).toBe(
      'ORIGINATION_RESULT_UNKNOWN',
    );
    expect(reconciliationEventOf({ kind: 'INCONCLUSIVE' }).type).toBe(
      'RECONCILIATION_INCONCLUSIVE',
    );
  });

  it('call-session transitions: accepted origination is not "answered"; terminals are final', () => {
    expect(isValidCallSessionStateTransition('CREATED', 'ACTIVE')).toBe(false);
    expect(isValidCallSessionStateTransition('CONNECTING', 'ACTIVE')).toBe(true);
    expect(isValidCallSessionStateTransition('ENDED', 'ACTIVE')).toBe(false);
  });
});
