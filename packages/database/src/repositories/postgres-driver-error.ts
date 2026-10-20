/**
 * Localiza o erro original do driver `pg` (com `code` SQLSTATE) atravessando
 * os encapsulamentos do Drizzle (`cause`). Não expõe mensagens ou parâmetros.
 */
export function findDriverError(error: unknown, maxDepth: number): Record<string, unknown> | null {
  let current: unknown = error;
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (typeof current !== 'object' || current === null) return null;
    const record = current as Record<string, unknown>;
    if (typeof record.code === 'string') return record;
    if (!('cause' in record)) return null;
    current = record.cause;
  }
  return null;
}
