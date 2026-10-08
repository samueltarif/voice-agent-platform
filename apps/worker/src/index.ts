import type { DomainEvent } from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';

export interface WorkerContext {
  readonly logger: Logger;
}

export function createWorkerContext(): WorkerContext {
  return {
    logger: createNullLogger(),
  };
}

export const WORKER_APP = 'worker' as const;
export type { DomainEvent };

export * from './outbound-retry-policy.js';
export * from './in-memory-outbound-repository.js';
export * from './in-memory-outbound-bootstrap-port.js';
export * from './outbound-call-dispatcher.js';
