import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ACTIONS, resolveCampaignTransition } from './campaign-lifecycle.js';
import { OUTBOUND_CAMPAIGN_STATUSES } from './outbound-contracts.js';

const ALLOWED: Record<string, string> = {
  'DRAFT:START': 'ACTIVE',
  'ACTIVE:PAUSE': 'PAUSED',
  'PAUSED:RESUME': 'ACTIVE',
  'DRAFT:CANCEL': 'CANCELED',
  'ACTIVE:CANCEL': 'CANCELED',
  'PAUSED:CANCEL': 'CANCELED',
};

describe('008-MVP2 campaign transition table', () => {
  it('allows exactly the documented transitions and rejects every other combination', () => {
    for (const status of OUTBOUND_CAMPAIGN_STATUSES) {
      for (const action of CAMPAIGN_ACTIONS) {
        const expected = ALLOWED[`${status}:${action}`];
        expect(resolveCampaignTransition(status, action)).toEqual(
          expected ? { ok: true, to: expected } : { ok: false, reason: 'INVALID_TRANSITION' },
        );
      }
    }
  });

  it('never leaves a terminal campaign', () => {
    for (const action of CAMPAIGN_ACTIONS) {
      expect(resolveCampaignTransition('CANCELED', action).ok).toBe(false);
      expect(resolveCampaignTransition('COMPLETED', action).ok).toBe(false);
    }
  });
});
