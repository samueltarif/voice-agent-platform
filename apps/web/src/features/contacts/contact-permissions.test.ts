import { describe, it, expect } from 'vitest';
import { TENANT_ROLES } from '@voice-agent/contracts';
import { canHaltCampaigns, canOperateCampaigns } from '../campaigns/campaign-permissions';
import { canManageContacts, canSuppressContacts } from './contact-permissions';

/** Espelho exato das tabelas de RBAC da API (contact-/campaign-permissions.ts). */
const EXPECTED = {
  OWNER: [true, true, true, true],
  ADMIN: [true, true, true, true],
  MANAGER: [true, true, true, true],
  OPERATOR: [false, true, false, true],
  VIEWER: [false, false, false, false],
} as const;

describe('UI RBAC mirrors the API tables', () => {
  it.each(TENANT_ROLES)('%s', (role) => {
    expect([
      canManageContacts(role),
      canSuppressContacts(role),
      canOperateCampaigns(role),
      canHaltCampaigns(role),
    ]).toEqual(EXPECTED[role]);
  });

  it('denies unknown or missing roles', () => {
    for (const role of [undefined, null, '', 'owner', 'SUPERUSER']) {
      expect(canSuppressContacts(role) || canHaltCampaigns(role)).toBe(false);
    }
  });
});
