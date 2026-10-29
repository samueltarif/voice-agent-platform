import type { CampaignAction, TenantRole } from '@voice-agent/contracts';

/**
 * Espelho de UI do RBAC da API (008-MVP2). A API continua sendo a autoridade:
 * esconder um botão nunca substitui a checagem no servidor.
 */
export function canOperateCampaigns(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

/** Ações protetivas (pausar/cancelar) também valem para OPERATOR. */
export function canHaltCampaigns(role?: TenantRole | string | null): boolean {
  return canOperateCampaigns(role) || role === 'OPERATOR';
}

export function canRunCampaignAction(
  role: TenantRole | string | null | undefined,
  action: CampaignAction,
): boolean {
  return action === 'PAUSE' || action === 'CANCEL'
    ? canHaltCampaigns(role)
    : canOperateCampaigns(role);
}
