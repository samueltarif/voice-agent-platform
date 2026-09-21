import type { DomainEvent } from '@voice-agent/contracts';
import { AppError } from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';

export interface ApiServerContext {
  readonly logger: Logger;
}

export function createApiContext(): ApiServerContext {
  return {
    logger: createNullLogger(),
  };
}

export const API_APP = 'api' as const;
export { AppError, type DomainEvent };
