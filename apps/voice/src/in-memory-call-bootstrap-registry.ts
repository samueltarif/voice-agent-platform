import type { CallBootstrap, CallBootstrapRegistryPort } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  CallBootstrapExpiredError,
  CallBootstrapNotFoundError,
} from '@voice-agent/errors';
import {
  assertPositiveCapacity,
  CallBootstrapCapacityExceededError,
  DEFAULT_MAX_BOOTSTRAP_REGISTRY_ENTRIES,
  isPastExpiry,
  sweepExpiredEntries,
  systemClock,
  type TrustedClock,
} from './bootstrap-memory-limits.js';

export interface InMemoryCallBootstrapRegistryOptions {
  readonly maxEntries?: number | undefined;
  /** Relógio confiável usado na limpeza; nunca o `now` informado por quem consome. */
  readonly clock?: TrustedClock | undefined;
}

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

function isRegistrableShape(bootstrap: CallBootstrap): boolean {
  return (
    typeof bootstrap?.bootstrapId === 'string' &&
    bootstrap.bootstrapId.length > 0 &&
    bootstrap.status === 'PENDING' &&
    isValidDate(bootstrap.createdAt) &&
    isValidDate(bootstrap.expiresAt)
  );
}

export class InMemoryCallBootstrapRegistry implements CallBootstrapRegistryPort {
  private readonly store = new Map<string, CallBootstrap>();
  private readonly maxEntries: number;
  private readonly clock: TrustedClock;

  constructor(options: InMemoryCallBootstrapRegistryOptions = {}) {
    this.maxEntries = assertPositiveCapacity(
      options.maxEntries ?? DEFAULT_MAX_BOOTSTRAP_REGISTRY_ENTRIES,
    );
    this.clock = options.clock ?? systemClock;
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Etapa A (DEC-049): aceita só bootstrap `PENDING`, com id não vazio,
   * datas válidas, ainda não vencido e com id inédito; nunca sobrescreve uma
   * entrada existente (inclusive consumida). Cheio após a limpeza ⇒ recusa.
   * Não impõe formato de id além do que os chamadores atuais garantem.
   */
  async register(bootstrap: CallBootstrap): Promise<void> {
    const now = this.clock();
    if (!isRegistrableShape(bootstrap)) {
      throw new TypeError('Invalid call bootstrap registration');
    }
    if (isPastExpiry(bootstrap.expiresAt, now)) {
      throw new CallBootstrapExpiredError('Call bootstrap is already expired');
    }
    sweepExpiredEntries(this.store, (entry) => entry.expiresAt, now);
    if (this.store.has(bootstrap.bootstrapId)) {
      throw new TypeError('Call bootstrap id already registered');
    }
    if (this.store.size >= this.maxEntries) throw new CallBootstrapCapacityExceededError();
    this.store.set(bootstrap.bootstrapId, bootstrap);
  }

  async getById(bootstrapId: string): Promise<CallBootstrap | null> {
    return this.store.get(bootstrapId) ?? null;
  }

  async consume(bootstrapId: string, now = new Date()): Promise<CallBootstrap> {
    sweepExpiredEntries(this.store, (entry) => entry.expiresAt, this.clock());
    const existing = this.store.get(bootstrapId);
    if (!existing) {
      throw new CallBootstrapNotFoundError(`Call bootstrap not found: '${bootstrapId}'`);
    }

    if (existing.status === 'CONSUMED') {
      throw new CallBootstrapAlreadyConsumedError(
        `Call bootstrap '${bootstrapId}' has already been consumed`,
      );
    }

    if (now.getTime() > existing.expiresAt.getTime() || existing.status === 'EXPIRED') {
      this.store.set(bootstrapId, { ...existing, status: 'EXPIRED' });
      throw new CallBootstrapExpiredError(`Call bootstrap '${bootstrapId}' has expired`);
    }

    const consumed: CallBootstrap = {
      ...existing,
      status: 'CONSUMED',
      consumedAt: now,
    };
    this.store.set(bootstrapId, consumed);
    return consumed;
  }
}
