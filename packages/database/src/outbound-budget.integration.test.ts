import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  createTenant,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import type {
  TelephonyOriginationPort,
  TelephonyOriginationRequest,
  TelephonyOriginationResult,
  TelephonyReconciliationPort,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';

const tdb = await createDisposableTestDatabase('outbound-budget-integration');

describe('008-OF3 Outbound Budget, Quotas and Concurrency', () => {
  const left = { db: tdb.db };
  const right = createDatabaseConnection({ connectionString: tdb.url });
  const budgetRepoL = new DrizzleOutboundBudgetRepository(left.db);
  const budgetRepoR = new DrizzleOutboundBudgetRepository(right.db);
  const attemptRepo = new DrizzleCallAttemptRepository(left.db);

  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(left.db);
    // Platform global ledger must be configured before tenant operations can succeed (fail-closed)
    await budgetRepoL.provisionGlobalLedger({
      currency: 'USD',
      allocatedBudgetMinorUnits: 10000000, // $100,000.00
      maxConcurrentCalls: 500,
    });
  });

  afterAll(async () => {
    await right.pool.end();
    await tdb.drop();
  });

  async function createPreparedAttempt(tenant: TenantFixture, tag = 'att') {
    const jobId = await createExtraJob(left.db, { tenant, tag });
    const attemptId = randomUUID();
    const prepared = await attemptRepo.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId,
      attemptId,
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') {
      throw new Error(`Failed to prepare attempt: ${prepared.reason}`);
    }
    return prepared.record.attempt;
  }

  it('provisions and retrieves tenant budget ledger with available balance', async () => {
    const orgId = fx.tenantA.organizationId;
    const ledger = await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 10000, // $100.00
      currency: 'USD',
      maxConcurrentCalls: 3,
      maxDailyAttempts: 25,
      timezone: 'UTC',
    });

    expect(ledger.organizationId).toBe(orgId);
    expect(ledger.allocatedBudgetMinorUnits).toBe(10000);
    expect(ledger.reservedAmountMinorUnits).toBe(0);
    expect(ledger.spentAmountMinorUnits).toBe(0);
    expect(ledger.availableAmountMinorUnits).toBe(10000);
    expect(ledger.maxConcurrentCalls).toBe(3);
    expect(ledger.maxDailyAttempts).toBe(25);
    expect(ledger.timezone).toBe('UTC');

    const retrieved = await budgetRepoL.getLedger(orgId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(ledger.id);
    expect(retrieved?.availableAmountMinorUnits).toBe(10000);
  });

  it('reserves budget atomically and deducts from available balance', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'res-1');

    const outcome = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 500, // $5.00
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt.idempotencyKey,
    });

    expect(outcome.kind).toBe('RESERVED');
    if (outcome.kind !== 'RESERVED') return;

    expect(outcome.reservation.status).toBe('RESERVED');
    expect(outcome.reservation.reservedAmountMinorUnits).toBe(500);
    expect(outcome.reservation.reservedCarrierMinorUnits).toBe(300);
    expect(outcome.reservation.reservedConversationalMinorUnits).toBe(200);

    const ledger = await budgetRepoL.getLedger(orgId);
    expect(ledger?.reservedAmountMinorUnits).toBe(500);
    expect(ledger?.availableAmountMinorUnits).toBe(9500);
  });

  it('guarantees idempotency for duplicate reservations on same attempt or key', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'idem-1');

    const first = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 400,
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 150,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(first.kind).toBe('RESERVED');

    const duplicate = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 400,
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 150,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(duplicate.kind).toBe('ALREADY_RESERVED');
    if (duplicate.kind === 'ALREADY_RESERVED' && first.kind === 'RESERVED') {
      expect(duplicate.reservation.id).toBe(first.reservation.id);
    }
  });

  it('rejects reservation fail-closed when balance is insufficient (solvency guard)', async () => {
    const orgId = fx.tenantB.organizationId;
    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 600, // $6.00 total
      maxConcurrentCalls: 5,
      maxDailyAttempts: 50,
    });

    const attempt1 = await createPreparedAttempt(fx.tenantB, 'solv-1');
    const first = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt1.id,
      jobId: attempt1.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt1.idempotencyKey,
    });
    expect(first.kind).toBe('RESERVED');

    const attempt2 = await createPreparedAttempt(fx.tenantB, 'solv-2');
    const second = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt2.id,
      jobId: attempt2.jobId,
      estimatedAmountMinorUnits: 500, // needs 500, only 100 available
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt2.idempotencyKey,
    });

    expect(second.kind).toBe('INSUFFICIENT_FUNDS');
    if (second.kind === 'INSUFFICIENT_FUNDS') {
      expect(second.availableMinorUnits).toBe(100);
      expect(second.requestedMinorUnits).toBe(500);
    }

    const ledger = await budgetRepoL.getLedger(orgId);
    expect(ledger?.availableAmountMinorUnits).toBe(100);
    expect(ledger?.reservedAmountMinorUnits).toBe(500);
  });

  it('enforces concurrency limits fail-closed across simultaneous reservations', async () => {
    const tenantConc = await createTenant(left.db, {
      runId: fx.runId,
      userId: fx.userId,
      tag: 'conc',
    });
    const orgId = tenantConc.organizationId;

    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 50000,
      maxConcurrentCalls: 2, // only 2 concurrent allowed
      maxDailyAttempts: 50,
    });

    const att1 = await createPreparedAttempt(tenantConc, 'conc-1');
    const att2 = await createPreparedAttempt(tenantConc, 'conc-2');
    const att3 = await createPreparedAttempt(tenantConc, 'conc-3');

    const res1 = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att1.id,
      jobId: att1.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att1.idempotencyKey,
    });
    expect(res1.kind).toBe('RESERVED');

    const res2 = await budgetRepoR.reserveBudget({
      organizationId: orgId,
      attemptId: att2.id,
      jobId: att2.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att2.idempotencyKey,
    });
    expect(res2.kind).toBe('RESERVED');

    // 3rd attempt should be blocked by concurrency limit
    const res3 = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att3.id,
      jobId: att3.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att3.idempotencyKey,
    });
    expect(res3.kind).toBe('CONCURRENCY_LIMIT_REACHED');
    if (res3.kind === 'CONCURRENCY_LIMIT_REACHED') {
      expect(res3.activeConcurrentCalls).toBe(2);
      expect(res3.maxConcurrentCalls).toBe(2);
    }
  });

  it('settles budget with refund of unused reservation and separate carrier/AI accounting', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'settle-1');

    const reserved = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 600, // $6.00 reserved
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 300,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');

    // Settle with lower actual cost: $1.50 Carrier + $1.00 Conversational = $2.50 (250 minor units)
    const settled = await budgetRepoL.settleBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      actualCarrierCostMinorUnits: 150,
      actualConversationalCostMinorUnits: 100,
    });

    expect(settled.kind).toBe('SETTLED');
    if (settled.kind !== 'SETTLED') return;

    expect(settled.totalSettledMinorUnits).toBe(250);
    expect(settled.unusedReservationRefundedMinorUnits).toBe(350); // 600 - 250 = 350 refunded
    expect(settled.overageMinorUnits).toBe(0);
    expect(settled.reservation.status).toBe('COMMITTED');
    expect(settled.reservation.settledCarrierMinorUnits).toBe(150);
    expect(settled.reservation.settledConversationalMinorUnits).toBe(100);

    const ledger = await budgetRepoL.getLedger(orgId);
    expect(ledger?.spentCarrierMinorUnits).toBeGreaterThanOrEqual(150);
    expect(ledger?.spentConversationalMinorUnits).toBeGreaterThanOrEqual(100);
    expect(ledger?.spentAmountMinorUnits).toBeGreaterThanOrEqual(250);
  });

  it('releases budget and unencumbers funds when origination is aborted', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'release-1');

    const beforeLedger = await budgetRepoL.getLedger(orgId);
    const initialReserved = beforeLedger?.reservedAmountMinorUnits ?? 0;

    const reserved = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 450,
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');

    const released = await budgetRepoL.releaseBudget({
      organizationId: orgId,
      attemptId: attempt.id,
      reason: 'CARRIER_UNREACHABLE',
    });

    expect(released.kind).toBe('RELEASED');
    if (released.kind === 'RELEASED') {
      expect(released.releasedAmountMinorUnits).toBe(450);
      expect(released.reservation.status).toBe('RELEASED');
      expect(released.reservation.releaseReason).toBe('CARRIER_UNREACHABLE');
    }

    const afterLedger = await budgetRepoL.getLedger(orgId);
    expect(afterLedger?.reservedAmountMinorUnits).toBe(initialReserved);
  });

  it('coordinates budget and runner through DurableGuardedOriginationRunner with explicit costs', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'guarded-1');

    let originationCalls = 0;
    const fakeOrigination: TelephonyOriginationPort = {
      providerName: 'fake_carrier',
      originate: async (
        request: TelephonyOriginationRequest,
      ): Promise<TelephonyOriginationResult> => {
        originationCalls++;
        return {
          kind: 'ACCEPTED',
          providerReference: `call_${request.attemptId}`,
        };
      },
    };

    const fakeReconciliation: TelephonyReconciliationPort = {
      reconcile: async (): Promise<TelephonyReconciliationResult> => {
        throw new Error('Not used in this test');
      },
    };

    const runner = new DurableOutboundOriginationRunner({
      db: left.db,
      attempts: attemptRepo,
      origination: fakeOrigination,
      reconciliation: fakeReconciliation,
      ownerId: 'test_worker',
      leaseMs: 5000,
      newEventId: () => randomUUID(),
      now: () => new Date(),
    });

    const guardedRunner = new DurableGuardedOriginationRunner({
      runner,
      attempts: attemptRepo,
      budget: budgetRepoL,
    });

    const result = await guardedRunner.originate(
      {
        organizationId: orgId,
        attemptId: attempt.id,
      },
      {
        estimatedCarrierMinorUnits: 180,
        estimatedConversationalMinorUnits: 120,
      },
    );

    expect(result.kind).toBe('COMPLETED');
    expect(originationCalls).toBe(1);

    // Verify reservation was created
    const ledger = await budgetRepoL.getLedger(orgId);
    expect(ledger?.reservedAmountMinorUnits).toBeGreaterThanOrEqual(300);
  });

  it('stress tests race condition solvency: multiple concurrent workers cannot drive balance negative', async () => {
    const tenantStress = await createTenant(left.db, {
      runId: fx.runId,
      userId: fx.userId,
      tag: 'stress',
    });
    const orgId = tenantStress.organizationId;

    // Exactly 1500 minor units ($15.00) allocated, each reservation requests 500 minor units
    // Exactly 3 reservations should succeed, others must fail with INSUFFICIENT_FUNDS
    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 1500,
      maxConcurrentCalls: 10,
      maxDailyAttempts: 50,
    });

    // Create 6 prepared attempts
    const attempts = await Promise.all([
      createPreparedAttempt(tenantStress, 'stress-1'),
      createPreparedAttempt(tenantStress, 'stress-2'),
      createPreparedAttempt(tenantStress, 'stress-3'),
      createPreparedAttempt(tenantStress, 'stress-4'),
      createPreparedAttempt(tenantStress, 'stress-5'),
      createPreparedAttempt(tenantStress, 'stress-6'),
    ]);

    // Barrier: dispatch all 6 concurrently across both repo connections
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGate = resolve));

    const promises = attempts.map(async (att, idx) => {
      await gate;
      const repo = idx % 2 === 0 ? budgetRepoL : budgetRepoR;
      return repo.reserveBudget({
        organizationId: orgId,
        attemptId: att.id,
        jobId: att.jobId,
        estimatedAmountMinorUnits: 500,
        estimatedCarrierMinorUnits: 300,
        estimatedConversationalMinorUnits: 200,
        idempotencyKey: att.idempotencyKey,
      });
    });

    releaseGate();
    const outcomes = await Promise.all(promises);

    const reservedCount = outcomes.filter((o) => o.kind === 'RESERVED').length;
    const insufficientCount = outcomes.filter((o) => o.kind === 'INSUFFICIENT_FUNDS').length;

    expect(reservedCount).toBe(3);
    expect(insufficientCount).toBe(3);

    const finalLedger = await budgetRepoL.getLedger(orgId);
    expect(finalLedger?.allocatedBudgetMinorUnits).toBe(1500);
    expect(finalLedger?.reservedAmountMinorUnits).toBe(1500);
    expect(finalLedger?.availableAmountMinorUnits).toBe(0);
  });

  it('enforces daily quota limit fail-closed when maxDailyAttempts is reached', async () => {
    const tenantQuota = await createTenant(left.db, {
      runId: fx.runId,
      userId: fx.userId,
      tag: 'quota',
    });
    const orgId = tenantQuota.organizationId;

    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 10000,
      maxConcurrentCalls: 10,
      maxDailyAttempts: 2, // only 2 attempts permitted today
    });

    // Create and reserve attempt 1
    const att1 = await createPreparedAttempt(tenantQuota, 'q-1');
    const res1 = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att1.id,
      jobId: att1.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att1.idempotencyKey,
    });
    expect(res1.kind).toBe('RESERVED');

    // Create and reserve attempt 2
    const att2 = await createPreparedAttempt(tenantQuota, 'q-2');
    const res2 = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att2.id,
      jobId: att2.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att2.idempotencyKey,
    });
    expect(res2.kind).toBe('RESERVED');

    // Create attempt 3 (now there are 3 attempts created today)
    const att3 = await createPreparedAttempt(tenantQuota, 'q-3');
    const res3 = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att3.id,
      jobId: att3.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att3.idempotencyKey,
    });

    expect(res3.kind).toBe('DAILY_QUOTA_EXCEEDED');
    if (res3.kind === 'DAILY_QUOTA_EXCEEDED') {
      expect(res3.todayAttemptsCount).toBeGreaterThanOrEqual(2);
      expect(res3.maxDailyAttempts).toBe(2);
    }
  });
});
