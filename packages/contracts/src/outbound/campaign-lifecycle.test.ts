import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_ACTIONS,
  createCampaignDraftInputSchema,
  resolveCampaignTransition,
} from './campaign-lifecycle.js';
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

describe('createCampaignDraftInputSchema (008-MVP2b)', () => {
  const agentId = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';

  it('accepts a trimmed name and an agent id', () => {
    expect(createCampaignDraftInputSchema.parse({ name: '  Reativação ', agentId })).toEqual({
      name: 'Reativação',
      agentId,
    });
  });

  it('never lets the client pick the version, status or organization', () => {
    for (const extra of [
      { agentVersionId: agentId },
      { status: 'ACTIVE' },
      { organizationId: agentId },
    ]) {
      expect(
        createCampaignDraftInputSchema.safeParse({ name: 'X', agentId, ...extra }).success,
      ).toBe(false);
    }
  });

  it('rejects blank names and non-uuid agents', () => {
    expect(createCampaignDraftInputSchema.safeParse({ name: '   ', agentId }).success).toBe(false);
    expect(createCampaignDraftInputSchema.safeParse({ name: 'X', agentId: '..' }).success).toBe(
      false,
    );
  });
});
