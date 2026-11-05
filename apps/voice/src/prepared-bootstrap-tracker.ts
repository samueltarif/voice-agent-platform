import {
  assertPositiveCapacity,
  CallBootstrapCapacityExceededError,
  sweepExpiredEntries,
} from './bootstrap-memory-limits.js';
import type { CallBootstrap } from '@voice-agent/contracts';
import type { PreparedToolGrantSource } from './published-tool-grant.js';

export interface PreparedBootstrapTrackerOptions {
  readonly capacity: number;
  /** Recebe só a contagem de pendentes (nenhum dado da chamada). */
  readonly onCapacityExceeded?: ((pending: number) => void) | undefined;
}

interface PreparedEntry {
  readonly source: PreparedToolGrantSource;
  readonly expiresAt: Date;
}

/**
 * Etapa A (DEC-049) — registro em memória do que o `CallLifecycleGateway`
 * preparou (base da prova de origem da D8b). Reserva antes do `register` e
 * libera se ele falhar (sem estado parcial); `take` remove na primeira
 * tentativa de consumo (consumo único preservado).
 */
export class PreparedBootstrapTracker {
  private readonly entries = new Map<string, PreparedEntry>();
  private readonly capacity: number;
  private readonly onCapacityExceeded: ((pending: number) => void) | undefined;

  constructor(options: PreparedBootstrapTrackerOptions) {
    this.capacity = assertPositiveCapacity(options.capacity);
    this.onCapacityExceeded = options.onCapacityExceeded;
  }

  get size(): number {
    return this.entries.size;
  }

  sweep(now: Date): number {
    return sweepExpiredEntries(this.entries, (entry) => entry.expiresAt, now);
  }

  /** Lança `CallBootstrapCapacityExceededError` se cheio após a limpeza. */
  reserveBootstrap(bootstrap: CallBootstrap, now: Date): void {
    this.sweep(now);
    if (this.entries.size >= this.capacity) {
      this.onCapacityExceeded?.(this.entries.size);
      throw new CallBootstrapCapacityExceededError();
    }
    const source: PreparedToolGrantSource = {
      bootstrapId: bootstrap.bootstrapId,
      callId: bootstrap.callId,
      organizationId: bootstrap.organizationId,
      agentId: bootstrap.agentId,
      agentVersionId: bootstrap.agentVersionId,
      snapshot: bootstrap.agentSnapshot,
    };
    this.entries.set(bootstrap.bootstrapId, { source, expiresAt: bootstrap.expiresAt });
  }

  release(bootstrapId: string): void {
    this.entries.delete(bootstrapId);
  }

  take(bootstrapId: string): PreparedToolGrantSource | undefined {
    const entry = this.entries.get(bootstrapId);
    this.entries.delete(bootstrapId);
    return entry?.source;
  }
}
