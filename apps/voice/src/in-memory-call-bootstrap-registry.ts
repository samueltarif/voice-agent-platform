import type { CallBootstrap, CallBootstrapRegistryPort } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  CallBootstrapExpiredError,
  CallBootstrapNotFoundError,
} from '@voice-agent/errors';

export class InMemoryCallBootstrapRegistry implements CallBootstrapRegistryPort {
  private readonly store = new Map<string, CallBootstrap>();

  async register(bootstrap: CallBootstrap): Promise<void> {
    this.store.set(bootstrap.bootstrapId, bootstrap);
  }

  async getById(bootstrapId: string): Promise<CallBootstrap | null> {
    return this.store.get(bootstrapId) ?? null;
  }

  async consume(bootstrapId: string, now = new Date()): Promise<CallBootstrap> {
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
