import type {
  CampaignAction,
  CampaignProgress,
  OutboundCampaignStatus,
  TenantRole,
} from '@voice-agent/contracts';
import { canRunCampaignAction } from './campaign-permissions';

export const CAMPAIGN_STATUS_LABELS: Readonly<Record<OutboundCampaignStatus, string>> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
};

export const CAMPAIGN_ACTION_LABELS: Readonly<Record<CampaignAction, string>> = {
  START: 'Iniciar campanha',
  PAUSE: 'Pausar',
  RESUME: 'Retomar',
  CANCEL: 'Cancelar campanha',
};

/**
 * Ações oferecidas por status (UI). Precisa coincidir com
 * `resolveCampaignTransition` dos contratos — um teste garante a equivalência.
 */
export const CAMPAIGN_ACTIONS_BY_STATUS: Readonly<
  Record<OutboundCampaignStatus, readonly CampaignAction[]>
> = {
  DRAFT: ['START', 'CANCEL'],
  ACTIVE: ['PAUSE', 'CANCEL'],
  PAUSED: ['RESUME', 'CANCEL'],
  COMPLETED: [],
  CANCELED: [],
};

export function availableCampaignActions(
  status: OutboundCampaignStatus,
  role: TenantRole | string | null | undefined,
): CampaignAction[] {
  return CAMPAIGN_ACTIONS_BY_STATUS[status].filter((a) => canRunCampaignAction(role, a));
}

/** Jobs que já não serão mais discados (resultado final), em % do total. */
export function campaignSettledPercent(progress: CampaignProgress): number {
  if (progress.total <= 0) return 0;
  const settled = progress.completed + progress.failed + progress.canceled;
  return Math.min(100, Math.round((settled / progress.total) * 100));
}

export const CAMPAIGN_PROGRESS_ROWS: readonly {
  readonly key: Exclude<keyof CampaignProgress, 'total'>;
  readonly label: string;
}[] = [
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'inProgress', label: 'Em andamento' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'failed', label: 'Falharam' },
  { key: 'canceled', label: 'Canceladas' },
];
