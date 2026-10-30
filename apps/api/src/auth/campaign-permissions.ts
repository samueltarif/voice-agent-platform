import type { CampaignAction, TenantRole } from '@voice-agent/contracts';

export type CampaignPermission = 'campaigns.operate' | 'campaigns.halt' | 'campaigns.costs';

/**
 * 008-MVP2. Ações que levam a discagens (audiência, START, RESUME) exigem
 * `campaigns.operate`; ações protetivas (PAUSE, CANCEL) também são permitidas
 * a OPERATOR via `campaigns.halt`, como o registro de supressão na 008-MVP1.
 * 008-MVP4: custos do ledger (`campaigns.costs`) só para quem opera campanhas.
 */
export const CAMPAIGN_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<CampaignPermission>>
> = {
  OWNER: new Set(['campaigns.operate', 'campaigns.halt', 'campaigns.costs']),
  ADMIN: new Set(['campaigns.operate', 'campaigns.halt', 'campaigns.costs']),
  MANAGER: new Set(['campaigns.operate', 'campaigns.halt', 'campaigns.costs']),
  OPERATOR: new Set(['campaigns.halt']),
  VIEWER: new Set(),
};

export function hasCampaignPermission(role: TenantRole, permission: CampaignPermission): boolean {
  return CAMPAIGN_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function permissionForCampaignAction(action: CampaignAction): CampaignPermission {
  return action === 'PAUSE' || action === 'CANCEL' ? 'campaigns.halt' : 'campaigns.operate';
}
