import { z } from 'zod';

/**
 * Estados de uma TENTATIVA de discagem (entidade distinta de job de campanha,
 * sessão conversacional, evento externo e liquidação financeira).
 *
 * CREATED               tentativa criada, sem intenção registrada.
 * ORIGINATION_PENDING   intenção registrada; NADA foi enviado ao exterior.
 * ORIGINATION_SENT      envio iniciado (write-ahead); resultado ainda não conhecido.
 * ORIGINATION_ACCEPTED  aceite confirmado pela autoridade de originação.
 * OUTCOME_UNKNOWN       enviado, resultado desconhecido: BLOQUEIA rediscagem cega.
 * RECONCILIATION_PENDING reconciliação solicitada; ainda sem resposta conclusiva.
 * ORIGINATION_REJECTED  (terminal) rejeição confirmada; nenhuma chamada criada.
 * NOT_ORIGINATED        (terminal) reconciliação provou que nenhuma chamada foi criada.
 * CLOSED                (terminal) chamada existiu e o encerramento foi confirmado.
 * CANCELED              (terminal) cancelada antes de qualquer envio.
 */
export const OUTBOUND_ATTEMPT_STATES = [
  'CREATED',
  'ORIGINATION_PENDING',
  'ORIGINATION_SENT',
  'ORIGINATION_ACCEPTED',
  'OUTCOME_UNKNOWN',
  'RECONCILIATION_PENDING',
  'ORIGINATION_REJECTED',
  'NOT_ORIGINATED',
  'CLOSED',
  'CANCELED',
] as const;

export const outboundAttemptStateSchema = z.enum(OUTBOUND_ATTEMPT_STATES);
export type OutboundAttemptState = z.infer<typeof outboundAttemptStateSchema>;

export const TERMINAL_OUTBOUND_ATTEMPT_STATES: ReadonlySet<OutboundAttemptState> = new Set([
  'ORIGINATION_REJECTED',
  'NOT_ORIGINATED',
  'CLOSED',
  'CANCELED',
]);

/** Estados em que o desfecho externo é incerto: rediscagem automática é proibida. */
export const UNRESOLVED_OUTCOME_ATTEMPT_STATES: ReadonlySet<OutboundAttemptState> = new Set([
  'OUTCOME_UNKNOWN',
  'RECONCILIATION_PENDING',
]);

export function isTerminalAttemptState(state: OutboundAttemptState): boolean {
  return TERMINAL_OUTBOUND_ATTEMPT_STATES.has(state);
}
