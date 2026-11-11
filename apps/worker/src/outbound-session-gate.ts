import type { BudgetEvaluationDecision } from '@voice-agent/contracts';

/**
 * 008-OF5 (S4) — Portão PURO avaliado antes de preparar sessão ou discar.
 * Toda dúvida é fail-closed. A ordem importa: o kill switch vence tudo, e a
 * versão do agente precisa ser PUBLICADA e da MESMA organização.
 */
export type CampaignSendState = 'ACTIVE' | 'PAUSED' | 'CANCELED';

export interface OutboundSessionGateInput {
  readonly organizationId: string;
  readonly killSwitchEngaged: boolean;
  /** Versão resolvida no servidor; `null` = inexistente para esta organização. */
  readonly agentVersion: {
    readonly organizationId: string;
    readonly status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  } | null;
  readonly entitlementActive: boolean;
  /** `null` = tentativa avulsa, sem campanha. */
  readonly campaignState: CampaignSendState | null;
  readonly destinationSuppressed: boolean;
  /** Decisão de orçamento já calculada sobre o ledger (008-OF3). */
  readonly budget: BudgetEvaluationDecision;
}

export type OutboundSessionGateBlockReason =
  | 'KILL_SWITCH_ENGAGED'
  | 'AGENT_VERSION_NOT_PUBLISHED'
  | 'ENTITLEMENT_INACTIVE'
  | 'CAMPAIGN_NOT_ACTIVE'
  | 'DESTINATION_SUPPRESSED'
  | 'BUDGET_DENIED';

export type OutboundSessionGateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: OutboundSessionGateBlockReason };

function blocked(reason: OutboundSessionGateBlockReason): OutboundSessionGateDecision {
  return { allowed: false, reason };
}

function isPublishedForOrganization(input: OutboundSessionGateInput): boolean {
  const version = input.agentVersion;
  return version?.status === 'PUBLISHED' && version.organizationId === input.organizationId;
}

export function evaluateOutboundSessionGate(
  input: OutboundSessionGateInput,
): OutboundSessionGateDecision {
  if (input.killSwitchEngaged !== false) return blocked('KILL_SWITCH_ENGAGED');
  if (!isPublishedForOrganization(input)) return blocked('AGENT_VERSION_NOT_PUBLISHED');
  if (input.entitlementActive !== true) return blocked('ENTITLEMENT_INACTIVE');
  if (input.campaignState !== null && input.campaignState !== 'ACTIVE') {
    return blocked('CAMPAIGN_NOT_ACTIVE');
  }
  if (input.destinationSuppressed !== false) return blocked('DESTINATION_SUPPRESSED');
  return input.budget.allowed ? { allowed: true } : blocked('BUDGET_DENIED');
}
