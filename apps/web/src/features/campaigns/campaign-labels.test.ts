import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_ACTIONS,
  OUTBOUND_CAMPAIGN_STATUSES,
  resolveCampaignTransition,
} from '@voice-agent/contracts';
import {
  CAMPAIGN_ACTIONS_BY_STATUS,
  availableCampaignActions,
  campaignSettledPercent,
} from './campaign-labels';
import { campaignActionSuccess } from './campaign-action-messages';

const zero = { total: 0, scheduled: 0, inProgress: 0, completed: 0, failed: 0, canceled: 0 };

describe('campaign actions offered by the UI', () => {
  it('matches the contract state machine for every status × action', () => {
    for (const status of OUTBOUND_CAMPAIGN_STATUSES) {
      for (const action of CAMPAIGN_ACTIONS) {
        const offered = CAMPAIGN_ACTIONS_BY_STATUS[status].includes(action);
        expect([status, action, offered]).toEqual([
          status,
          action,
          resolveCampaignTransition(status, action).ok,
        ]);
      }
    }
  });

  it('filters by role like the API (viewer none, operator only protective actions)', () => {
    expect(availableCampaignActions('ACTIVE', 'VIEWER')).toEqual([]);
    expect(availableCampaignActions('DRAFT', 'OPERATOR')).toEqual(['CANCEL']);
    expect(availableCampaignActions('ACTIVE', 'OPERATOR')).toEqual(['PAUSE', 'CANCEL']);
    expect(availableCampaignActions('PAUSED', 'OPERATOR')).toEqual(['CANCEL']);
    expect(availableCampaignActions('DRAFT', 'MANAGER')).toEqual(['START', 'CANCEL']);
    expect(availableCampaignActions('PAUSED', 'OWNER')).toEqual(['RESUME', 'CANCEL']);
    expect(availableCampaignActions('CANCELED', 'OWNER')).toEqual([]);
    expect(availableCampaignActions('ACTIVE', 'UNKNOWN')).toEqual([]);
  });
});

describe('campaign progress presentation', () => {
  it('reports 0% for an empty campaign instead of dividing by zero', () => {
    expect(campaignSettledPercent(zero)).toBe(0);
  });

  it('counts only finished jobs (completed, failed, canceled)', () => {
    expect(
      campaignSettledPercent({
        ...zero,
        total: 8,
        scheduled: 2,
        inProgress: 2,
        completed: 3,
        failed: 1,
      }),
    ).toBe(50);
  });

  it('describes outcomes with the real numbers returned by the API', () => {
    const outcome = {
      kind: 'TRANSITIONED' as const,
      status: 'ACTIVE' as const,
      jobsCreated: 7,
      jobsCanceled: 0,
    };
    expect(campaignActionSuccess('START', outcome)).toContain('7 contatos');
    expect(campaignActionSuccess('CANCEL', { ...outcome, jobsCanceled: 3 })).toContain(
      '3 contatos',
    );
  });
});
