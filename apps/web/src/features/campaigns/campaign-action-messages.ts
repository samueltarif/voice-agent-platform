import type { CampaignAction, CampaignActionOutcome } from '@voice-agent/contracts';

type Transitioned = Extract<CampaignActionOutcome, { kind: 'TRANSITIONED' }>;

/** Mensagem de sucesso com os números reais devolvidos pela API. */
export function campaignActionSuccess(action: CampaignAction, outcome: Transitioned): string {
  switch (action) {
    case 'START':
      return `Campanha iniciada: ${outcome.jobsCreated} contatos elegíveis agendados.`;
    case 'PAUSE':
      return 'Campanha pausada. Nenhum novo contato será discado até retomar.';
    case 'RESUME':
      return 'Campanha retomada.';
    case 'CANCEL':
      return `Campanha cancelada: ${outcome.jobsCanceled} contatos pendentes retirados.`;
  }
}
