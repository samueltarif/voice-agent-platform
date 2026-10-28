import { describe, expect, it } from 'vitest';
import {
  reserveOutboundBudgetInputSchema,
  settleOutboundBudgetInputSchema,
  releaseOutboundBudgetInputSchema,
  provisionGlobalBudgetLedgerInputSchema,
  provisionOutboundBudgetLedgerInputSchema,
  getStartOfDayInTimezone,
  type OutboundBudgetLedger,
  type PlatformGlobalBudgetLedger,
} from './index.js';
import {
  calculateAvailableBudget,
  evaluateBudgetReservation,
} from './evaluate-budget-reservation.js';

describe('Outbound Budget Contracts & Pure Evaluation', () => {
  const mockGlobalLedger: PlatformGlobalBudgetLedger = {
    id: 'platform_global',
    currency: 'USD',
    allocatedBudgetMinorUnits: 100000,
    reservedAmountMinorUnits: 10000,
    spentCarrierMinorUnits: 5000,
    spentConversationalMinorUnits: 5000,
    spentAmountMinorUnits: 10000,
    availableAmountMinorUnits: 80000,
    maxConcurrentCalls: 50,
    version: 1,
    createdAt: new Date('2026-10-27T00:00:00Z'),
    updatedAt: new Date('2026-10-27T00:00:00Z'),
  };

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
    timezone: 'UTC',
    version: 1,
    createdAt: new Date('2026-10-27T00:00:00Z'),
    updatedAt: new Date('2026-10-27T00:00:00Z'),
  };

  it('calculates available budget as allocated minus reserved and spent', () => {
    const available = calculateAvailableBudget(mockLedger);
    expect(available).toBe(5000);
  });

  it('caps available budget at zero when encumbered or spent exceeds allocated', () => {
    const exhaustedLedger = {
      ...mockLedger,
      allocatedBudgetMinorUnits: 4000,
      reservedAmountMinorUnits: 3000,
      spentAmountMinorUnits: 2000,
    };
    expect(calculateAvailableBudget(exhaustedLedger)).toBe(0);

    const overageLedger = {
      ...mockLedger,
      allocatedBudgetMinorUnits: 5000,
      reservedAmountMinorUnits: 0,
      spentAmountMinorUnits: 7500,
    };
    expect(calculateAvailableBudget(overageLedger)).toBe(0);
  });

  it('blocks reservation fail-closed with GLOBAL_LEDGER_NOT_FOUND when global ledger is absent', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: null,
      ledger: mockLedger,
      requestedAmountMinorUnits: 500,
      activeConcurrentCalls: 0,
      todayAttemptsCount: 0,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'GLOBAL_LEDGER_NOT_FOUND',
    });
  });

  it('blocks reservation when global concurrency limit is reached', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: mockGlobalLedger,
      globalActiveConcurrentCalls: 50,
      ledger: mockLedger,
      requestedAmountMinorUnits: 500,
      activeConcurrentCalls: 1,
      todayAttemptsCount: 5,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'GLOBAL_CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: 50,
      maxConcurrentCalls: 50,
    });
  });

  it('blocks reservation when global available budget is insufficient', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: {
        ...mockGlobalLedger,
        allocatedBudgetMinorUnits: 15000,
        reservedAmountMinorUnits: 10000,
        spentAmountMinorUnits: 5000,
      },
      globalActiveConcurrentCalls: 10,
      ledger: mockLedger,
      requestedAmountMinorUnits: 500,
      activeConcurrentCalls: 1,
      todayAttemptsCount: 5,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'GLOBAL_INSUFFICIENT_FUNDS',
      availableMinorUnits: 0,
      requestedMinorUnits: 500,
    });
  });

  it('blocks reservation with CONCURRENCY_LIMIT_REACHED when active calls exceed tenant limit', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: mockGlobalLedger,
      globalActiveConcurrentCalls: 10,
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

  it('blocks reservation with DAILY_QUOTA_EXCEEDED when daily attempts hit tenant limit', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: mockGlobalLedger,
      globalActiveConcurrentCalls: 10,
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

  it('blocks reservation with INSUFFICIENT_FUNDS when requested exceeds tenant available', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: mockGlobalLedger,
      globalActiveConcurrentCalls: 10,
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

  it('allows reservation when both global and tenant constraints are satisfied', () => {
    const decision = evaluateBudgetReservation({
      globalLedger: mockGlobalLedger,
      globalActiveConcurrentCalls: 10,
      ledger: mockLedger,
      requestedAmountMinorUnits: 2000,
      activeConcurrentCalls: 2,
      todayAttemptsCount: 10,
    });
    expect(decision).toEqual({
      allowed: true,
      availableMinorUnits: 5000,
      globalAvailableMinorUnits: 80000,
    });
  });

  it('calculates deterministic day boundary for different timezones', () => {
    const testDate = new Date('2026-10-27T14:30:00Z');
    const startUtc = getStartOfDayInTimezone(testDate, 'UTC');
    expect(startUtc.toISOString()).toBe('2026-10-27T00:00:00.000Z');

    const startSp = getStartOfDayInTimezone(testDate, 'America/Sao_Paulo');
    // Sao Paulo is UTC-3: 2026-10-27 00:00:00 local is 2026-10-27 03:00:00Z
    expect(startSp.toISOString()).toBe('2026-10-27T03:00:00.000Z');

    const startTokyo = getStartOfDayInTimezone(testDate, 'Asia/Tokyo');
    // Tokyo is UTC+9: at 14:30 UTC on Oct 27, it's 23:30 on Oct 27 local -> start is 2026-10-27 00:00 local = 2026-10-26 15:00:00Z
    expect(startTokyo.toISOString()).toBe('2026-10-26T15:00:00.000Z');
  });

  it('validates reserve, settle, release and provision schemas strictly', () => {
    const validReserve = reserveOutboundBudgetInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 60,
      estimatedConversationalMinorUnits: 40,
      idempotencyKey: 'res-att-1',
    });
    expect(validReserve.success).toBe(true);

    const missingCarrier = reserveOutboundBudgetInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      attemptId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      estimatedAmountMinorUnits: 100,
      idempotencyKey: 'res-att-1',
    });
    expect(missingCarrier.success).toBe(false);

    const validProvisionGlobal = provisionGlobalBudgetLedgerInputSchema.safeParse({
      currency: 'USD',
      allocatedBudgetMinorUnits: 500000,
      maxConcurrentCalls: 100,
    });
    expect(validProvisionGlobal.success).toBe(true);

    const validProvisionTenant = provisionOutboundBudgetLedgerInputSchema.safeParse({
      organizationId: '22222222-2222-4222-8222-222222222222',
      allocatedBudgetMinorUnits: 10000,
      timezone: 'America/Sao_Paulo',
    });
    expect(validProvisionTenant.success).toBe(true);
    if (validProvisionTenant.success) {
      expect(validProvisionTenant.data.timezone).toBe('America/Sao_Paulo');
    }

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
