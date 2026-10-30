import { describe, expect, it } from 'vitest';
import { hasCampaignPermission, permissionForCampaignAction } from './campaign-permissions.js';

describe('008-MVP2 campaign permissions', () => {
  it('maps dial-leading actions to operate and protective actions to halt', () => {
    expect(permissionForCampaignAction('START')).toBe('campaigns.operate');
    expect(permissionForCampaignAction('RESUME')).toBe('campaigns.operate');
    expect(permissionForCampaignAction('PAUSE')).toBe('campaigns.halt');
    expect(permissionForCampaignAction('CANCEL')).toBe('campaigns.halt');
  });

  it.each([
    ['OWNER', true, true, true],
    ['ADMIN', true, true, true],
    ['MANAGER', true, true, true],
    ['OPERATOR', false, true, false],
    ['VIEWER', false, false, false],
  ] as const)('%s: operate=%s halt=%s costs=%s', (role, operate, halt, costs) => {
    expect(hasCampaignPermission(role, 'campaigns.operate')).toBe(operate);
    expect(hasCampaignPermission(role, 'campaigns.halt')).toBe(halt);
    expect(hasCampaignPermission(role, 'campaigns.costs')).toBe(costs);
  });
});
