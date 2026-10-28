export type OutboundBudgetLedgerScope = 'GLOBAL' | 'TENANT';

/**
 * Violação de invariante financeira: settlement e release só podem mutar o
 * estado da reserva quando o ledger correspondente existe. Sem essa guarda o
 * gasto real seria perdido silenciosamente (fail-open) e novas admissões
 * ficariam acima do orçamento consumido.
 */
export class OutboundBudgetLedgerMissingError extends Error {
  readonly scope: OutboundBudgetLedgerScope;

  constructor(scope: OutboundBudgetLedgerScope) {
    super(`Outbound budget ledger '${scope}' not found; financial mutation aborted (fail-closed).`);
    this.name = 'OutboundBudgetLedgerMissingError';
    this.scope = scope;
  }
}

export function requireOutboundBudgetLedgerRow<T>(
  row: T | undefined,
  scope: OutboundBudgetLedgerScope,
): T {
  if (!row) throw new OutboundBudgetLedgerMissingError(scope);
  return row;
}
