export type BadgeVariantType =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger'
  | 'handoff';

export function formatCurrencyBrl(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.max(0, Math.floor(cents)) : 0;
  const reais = (safeCents / 100).toFixed(2).replace('.', ',');
  return `R$ ${reais}`;
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe}%`;
}

export function calculateCampaignProgressPercent(processed: number, total: number): number {
  if (!total || total <= 0) return 0;
  const ratio = (processed / total) * 100;
  return Math.min(100, Math.max(0, Math.round(ratio)));
}

export function getOutcomeBadgeVariant(outcome: string): BadgeVariantType {
  switch (outcome) {
    case 'QUALIFIED':
      return 'success';
    case 'UNQUALIFIED':
      return 'danger';
    case 'CALLBACK':
      return 'warning';
    case 'SCHEDULED':
      return 'handoff';
    default:
      return 'outline';
  }
}

export function getOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'QUALIFIED':
      return 'Qualificado';
    case 'UNQUALIFIED':
      return 'Sem interesse';
    case 'CALLBACK':
      return 'Retorno';
    case 'SCHEDULED':
      return 'Agendado';
    default:
      return outcome;
  }
}

export function getCallStatusBadgeVariant(status: string): BadgeVariantType {
  switch (status) {
    case 'IN_CALL':
      return 'success';
    case 'WAITING_AGENT':
      return 'handoff';
    case 'CONNECTING':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function getCallStatusLabel(status: string): string {
  switch (status) {
    case 'IN_CALL':
      return 'Em chamada';
    case 'WAITING_AGENT':
      return 'Aguardando humano';
    case 'CONNECTING':
      return 'Conectando';
    default:
      return status;
  }
}
