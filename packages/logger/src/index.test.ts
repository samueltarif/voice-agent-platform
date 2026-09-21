import { describe, expect, it } from 'vitest';
import { createNullLogger } from './index.js';

describe('Logger Package', () => {
  it('should create null logger that executes cleanly without errors', () => {
    const logger = createNullLogger();
    expect(() => {
      logger.info('Test info', { correlationId: 'corr_1' });
      logger.warn('Test warn');
      logger.error('Test error');
      logger.debug('Test debug');
    }).not.toThrow();
  });
});
