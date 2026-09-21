import type { Logger } from './logger-interface.js';

export function createNullLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}
