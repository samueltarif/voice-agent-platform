import { describe, expect, it } from 'vitest';
import {
  OPERATIONS_MAX_PERIOD_DAYS,
  listOperationsAttemptsQuerySchema,
  operationsOverviewQuerySchema,
} from './operations-overview.js';

describe('008-MVP4c operations queries', () => {
  it('defaults to a 7-day window and bounds it', () => {
    expect(operationsOverviewQuerySchema.parse({})).toEqual({ days: 7 });
    expect(operationsOverviewQuerySchema.parse({ days: '90' })).toEqual({
      days: OPERATIONS_MAX_PERIOD_DAYS,
    });
    for (const days of ['0', '91', '1.5', 'x']) {
      expect(operationsOverviewQuerySchema.safeParse({ days }).success).toBe(false);
    }
  });

  it('never accepts a tenant or unknown field from the caller', () => {
    expect(operationsOverviewQuerySchema.safeParse({ organizationId: 'x' }).success).toBe(false);
    expect(listOperationsAttemptsQuerySchema.safeParse({ organizationId: 'x' }).success).toBe(
      false,
    );
  });

  it('bounds attempt pagination and filters by known outcome classes only', () => {
    expect(listOperationsAttemptsQuerySchema.parse({})).toEqual({ days: 7, limit: 50, offset: 0 });
    expect(listOperationsAttemptsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listOperationsAttemptsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    expect(listOperationsAttemptsQuerySchema.safeParse({ outcome: 'ANSWERED' }).success).toBe(
      false,
    );
    expect(listOperationsAttemptsQuerySchema.parse({ outcome: 'HELD_BY_PAUSE' }).outcome).toBe(
      'HELD_BY_PAUSE',
    );
  });
});
