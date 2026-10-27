import { describe, expect, it } from 'vitest';
import {
  reserveOutboundBudgetInputSchema,
  settleOutboundBudgetInputSchema,
  releaseOutboundBudgetInputSchema,
  type OutboundBudgetLedger,
} from './outbound-budget-contracts.js';
import {
  calculateAvailableBudget,
  evaluateBudgetReservation,
} from './evaluate-budget-reservation.js';

describe('Outbound Budget Contracts & Pure Evaluation', () => {
  const mockLedger: OutboundBudgetLedger = {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    currency: 'USD',
    allocatedBudgetMinorUnits: 10000,
    reservedAmountMinorUnits: 2000,
    spentCarrierMinorUnits: 1500,
    spentConversationalMinorUnits: 1500,
    spentAmountMinorUnits: 3000,
    availableAmountMinorUnits: 5000,
    maxConcurrentCalls: 5,
    maxDailyAttempts: 50,
    version: 1,
    createdAt: new Date('2026-10-27T00:00:00Z'),
    updatedAt: new Date('2026-10-27T00:00:00Z'),
  };

  it('calculates available budget as allocated minus reserved and spent', () => {
    const available = calculateAvailableBudget(mockLedger);
    expect(available).toBe(5000);
  });

  it('caps available budget at zero when encumbered exceeds allocated', () => {
    const exhaustedLedger = {
      ...mockLedger,
      allocatedBudgetMinorUnits: 4000,
      reservedAmountMinorUnits: 3000,
      spentAmountMinorUnits: 2000,
    };
    const available = calculateAvailableBudget(exhaustedLedger);
    expect(available).toBe(0);
  });

  it('blocks reservation with CONCURRENCY_LIMIT_REACHED when active calls exceed limit', () => {
    const decision = evaluateBudgetReservation({
      ledger: mockLedger,
      requestedAmountMinorUnits: 500,
      activeConcurrentCalls: 5,
      todayAttemptsCount: 10,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: 5,
      maxConcurrentCalls: 5,
    });
  });

  it('blocks reservation with DAILY_QUOTA_EXCEEDED when daily attempts hit limit', () => {
    const decision = evaluateBudgetReservation({
      ledger: mockLedger,
      requestedAmountMinorUnits: 500,
      activeConcurrentCalls: 2,
      todayAttemptsCount: 50,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'DAILY_QUOTA_EXCEEDED',
      todayAttemptsCount: 50,
      maxDailyAttempts: 50,
    });
  });

  it('blocks reservation with INSUFFICIENT_FUNDS when requested exceeds available', () => {
    const decision = evaluateBudgetReservation({
      ledger: mockLedger,
      requestedAmountMinorUnits: 6000,
      activeConcurrentCalls: 1,
      todayAttemptsCount: 10,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_FUNDS',
      availableMinorUnits: 5000,
      requestedMinorUnits: 6000,
    });
  });

  it('allows reservation when concurrency, quota and budget are sufficient', () => {
    const decision = evaluateBudgetReservation({
      ledger: mockLedger,
      requestedAmountMinorUnits: 2000,
      activeConcurrentCalls: 2,
      todayAttemptsCount: 10,
    });
    expect(decision).toEqual({
      allowed: true,
      availableMinorUnits: 5000,
    });
  });

  it('validates reserve, settle and release input schemas strictly', () => {
    const validReserve = reserveOutboundBudgetInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      estimatedAmountMinorUnits: 100,
      idempotencyKey: 'res-att-1',
    });
    expect(validReserve.success).toBe(true);

    const invalidReserve = reserveOutboundBudgetInputSchema.safeParse({
      organizationId: 'not-a-uuid',
      attemptId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      estimatedAmountMinorUnits: -10,
      idempotencyKey: '',
    });
    expect(invalidReserve.success).toBe(false);

    const validSettle = settleOutboundBudgetInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      actualCarrierCostMinorUnits: 60,
      actualConversationalCostMinorUnits: 30,
    });
    expect(validSettle.success).toBe(true);

    const validRelease = releaseOutboundBudgetInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      reason: 'CALL_NOT_ORIGINATED',
    });
    expect(validRelease.success).toBe(true);
  });
});
