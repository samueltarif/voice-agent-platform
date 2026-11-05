import { AppError } from '@voice-agent/errors';

/**
 * Etapa A (DEC-049) — limites de memória dos registros de bootstrap.
 *
 * - Expiração: só o `expiresAt` emitido pelo servidor em `prepareCall`; uma
 *   entrada sai quando o relógio confiável passa de `expiresAt` (mesma regra
 *   estrita do consumo: no instante exato ainda é válida).
 * - Limpeza oportunista em preparo, registro e consumo; sem timer nem worker.
 * - Capacidade: cheia após a limpeza ⇒ recusa controlada; nunca expulsa uma
 *   entrada válida e não vencida.
 */
export type TrustedClock = () => Date;

export const systemClock: TrustedClock = () => new Date();

/** Preparos pendentes por instância do gateway. */
export const DEFAULT_MAX_PENDING_PREPARATIONS = 1_000;

/**
 * Entradas do registro por instância: pendentes + consumidas/expiradas ainda
 * dentro do vencimento (2 × pendentes), para que o consumo único continue
 * respondendo "já consumido" até o bootstrap vencer.
 */
export const DEFAULT_MAX_BOOTSTRAP_REGISTRY_ENTRIES = 2 * DEFAULT_MAX_PENDING_PREPARATIONS;

export class CallBootstrapCapacityExceededError extends AppError {
  constructor(message = 'Call bootstrap capacity exceeded') {
    super(message, 503, 'CALL_BOOTSTRAP_CAPACITY_EXCEEDED');
    this.name = 'CallBootstrapCapacityExceededError';
  }
}

export function assertPositiveCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('Bootstrap memory capacity must be a positive integer');
  }
  return value;
}

/** Vencido somente quando `now` passou de `expiresAt` (datas inválidas contam como vencidas). */
export function isPastExpiry(expiresAt: Date, now: Date): boolean {
  const expiry = expiresAt.getTime();
  return Number.isNaN(expiry) || now.getTime() > expiry;
}

export function sweepExpiredEntries<V>(
  entries: Map<string, V>,
  expiresAtOf: (value: V) => Date,
  now: Date,
): number {
  let removed = 0;
  for (const [key, value] of entries) {
    if (isPastExpiry(expiresAtOf(value), now)) {
      entries.delete(key);
      removed += 1;
    }
  }
  return removed;
}
