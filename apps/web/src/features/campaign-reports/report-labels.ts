import type { AttemptOutcomeClass } from '@voice-agent/contracts';

/** Tamanho da página de tentativas (servidor e cliente pedem +1 para detectar a próxima). */
export const ATTEMPTS_PAGE_SIZE = 25;

/** Rótulos e explicações das classes de desfecho (derivadas do estado persistido). */
export const OUTCOME_LABELS: Readonly<
  Record<AttemptOutcomeClass, { readonly label: string; readonly hint: string }>
> = {
  NOT_SENT_PENDING: { label: 'Não enviadas', hint: 'Preparadas, aguardando envio.' },
  HELD_BY_PAUSE: { label: 'Retidas pela pausa', hint: 'Nada foi discado; seguem ao retomar.' },
  IN_FLIGHT: { label: 'Em curso', hint: 'Envio iniciado ou aceito pelo provedor.' },
  OUTCOME_UNKNOWN: {
    label: 'Resultado desconhecido',
    hint: 'Enviadas sem confirmação; nunca rediscadas automaticamente.',
  },
  NO_CALL_CREATED: { label: 'Sem chamada criada', hint: 'Rejeitadas; nenhuma ligação existiu.' },
  CANCELED_BEFORE_SEND: { label: 'Canceladas', hint: 'Canceladas antes de qualquer envio.' },
  ENDED: { label: 'Encerradas', hint: 'Chamada existiu e foi encerrada.' },
};

/** Ordem de exibição: do que ainda não saiu ao que terminou. */
export const OUTCOME_ORDER: readonly AttemptOutcomeClass[] = [
  'NOT_SENT_PENDING',
  'HELD_BY_PAUSE',
  'IN_FLIGHT',
  'OUTCOME_UNKNOWN',
  'NO_CALL_CREATED',
  'CANCELED_BEFORE_SEND',
  'ENDED',
];

/**
 * Valor do ledger (unidades mínimas) formatado na moeda do tenant. Usa as
 * casas decimais da própria moeda; sem moeda conhecida, mostra só o número.
 */
export function formatMinorUnits(amount: number, currency: string | null): string {
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return `${amount} (unidades mínimas)`;
  const format = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amount / 10 ** digits);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}
