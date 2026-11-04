import type { OutboundAttemptState } from './outbound-attempt-state.js';

/**
 * 008-OF5a (S1) — Vínculo do identificador da chamada na operadora
 * (`providerReference`) à tentativa, por *compare-and-set*.
 *
 * Usado tanto pela resposta síncrona da criação da chamada quanto por um
 * callback que chegue antes dela (corrida). ATENÇÃO: esta é uma regra pura; ela
 * NÃO garante atomicidade. A persistência (S4) precisa aplicá-la num UPDATE
 * condicional na mesma transação (ex.: `WHERE provider_reference IS NULL`).
 */
export type ProviderReferenceBinding =
  | { readonly kind: 'BIND' }
  | { readonly kind: 'ALREADY_BOUND' }
  | { readonly kind: 'DIVERGENT_REFERENCE_ANOMALY' }
  | { readonly kind: 'NOT_BINDABLE_STATE' };

/**
 * Estados em que um identificador ainda pode ser vinculado. Em `OUTCOME_UNKNOWN`
 * e `RECONCILIATION_PENDING`, o vínculo PROVA que a chamada foi criada: resolve o
 * desconhecido sem rediscagem.
 */
export const PROVIDER_REFERENCE_BINDABLE_STATES: ReadonlySet<OutboundAttemptState> = new Set([
  'ORIGINATION_SENT',
  'ORIGINATION_ACCEPTED',
  'OUTCOME_UNKNOWN',
  'RECONCILIATION_PENDING',
]);

export interface ProviderReferenceBindingInput {
  readonly attemptState: OutboundAttemptState;
  readonly currentReference: string | null;
  readonly incomingReference: string;
}

export function evaluateProviderReferenceBinding(
  input: ProviderReferenceBindingInput,
): ProviderReferenceBinding {
  if (input.currentReference === input.incomingReference) return { kind: 'ALREADY_BOUND' };
  // Identificador diferente do já vinculado: possível originação duplicada.
  // Nenhuma transição e nenhuma rediscagem; ver classifySecondProviderReference.
  if (input.currentReference !== null) return { kind: 'DIVERGENT_REFERENCE_ANOMALY' };
  if (!PROVIDER_REFERENCE_BINDABLE_STATES.has(input.attemptState)) {
    return { kind: 'NOT_BINDABLE_STATE' };
  }
  return { kind: 'BIND' };
}
