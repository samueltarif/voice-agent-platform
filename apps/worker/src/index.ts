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
