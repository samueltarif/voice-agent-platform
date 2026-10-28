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
import type { TelephonyOriginationPort, TelephonyReconciliationPort } from '@voice-agent/contracts';

const tdb = await createDisposableTestDatabase('outbound-budget-global-integration');

describe('008-OF3 Global Hard Caps, Overage Settlement and Adversarial Protections', () => {
  const left = { db: tdb.db };
  const right = createDatabaseConnection({ connectionString: tdb.url });
  const budgetRepoL = new DrizzleOutboundBudgetRepository(left.db);
  const budgetRepoR = new DrizzleOutboundBudgetRepository(right.db);
  const attemptRepo = new DrizzleCallAttemptRepository(left.db);

  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(left.db);
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

  it('fails closed when global budget ledger is not configured', async () => {
    // Before global ledger is provisioned
    const attempt = await createPreparedAttempt(fx.tenantA, 'no-global');
    await budgetRepoL.provisionLedger({
      organizationId: fx.tenantA.organizationId,
      allocatedBudgetMinorUnits: 50000,
    });

    const outcome = await budgetRepoL.reserveBudget({
      organizationId: fx.tenantA.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt.idempotencyKey,
    });

    expect(outcome.kind).toBe('GLOBAL_LEDGER_NOT_FOUND');
  });

  it('enforces platform global budget cap when multiple tenants compete for last funds', async () => {
    // Provision global ledger with exactly 800 minor units ($8.00)
    await budgetRepoL.provisionGlobalLedger({
      currency: 'USD',
      allocatedBudgetMinorUnits: 800,
      maxConcurrentCalls: 100,
    });

    const tenant1 = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 't1' });
    const tenant2 = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 't2' });

    // Both tenants have plenty of individual budget ($50.00 each)
    await budgetRepoL.provisionLedger({
      organizationId: tenant1.organizationId,
      allocatedBudgetMinorUnits: 5000,
      maxConcurrentCalls: 10,
      maxDailyAttempts: 50,
    });
    await budgetRepoL.provisionLedger({
      organizationId: tenant2.organizationId,
      allocatedBudgetMinorUnits: 5000,
      maxConcurrentCalls: 10,
      maxDailyAttempts: 50,
    });

    const att1 = await createPreparedAttempt(tenant1, 'comp-1');
    const att2 = await createPreparedAttempt(tenant2, 'comp-2');

    // Tenant 1 reserves 500 minor units -> succeeds
    const res1 = await budgetRepoL.reserveBudget({
      organizationId: tenant1.organizationId,
      attemptId: att1.id,
      jobId: att1.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: att1.idempotencyKey,
    });
    expect(res1.kind).toBe('RESERVED');

    // Tenant 2 needs 500 minor units, but global only has 300 left (800 - 500)
    const res2 = await budgetRepoR.reserveBudget({
      organizationId: tenant2.organizationId,
      attemptId: att2.id,
      jobId: att2.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: att2.idempotencyKey,
    });

    expect(res2.kind).toBe('GLOBAL_INSUFFICIENT_FUNDS');
    if (res2.kind === 'GLOBAL_INSUFFICIENT_FUNDS') {
      expect(res2.availableMinorUnits).toBe(300);
      expect(res2.requestedMinorUnits).toBe(500);
    }

    const global = await budgetRepoL.getGlobalLedger();
    expect(global?.reservedAmountMinorUnits).toBe(500);
    expect(global?.availableAmountMinorUnits).toBe(300);

    await budgetRepoL.releaseBudget({
      organizationId: tenant1.organizationId,
      attemptId: att1.id,
      reason: 'TEST_CLEANUP',
    });
  });

  it('enforces platform global concurrency hard cap across organizations', async () => {
    // Increase global budget to 1,000,000 but set max concurrent calls to exactly 2
    await budgetRepoL.provisionGlobalLedger({
      currency: 'USD',
      allocatedBudgetMinorUnits: 1000000,
      maxConcurrentCalls: 2,
    });

    const tenantA = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 'ga' });
    const tenantB = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 'gb' });

    await budgetRepoL.provisionLedger({
      organizationId: tenantA.organizationId,
      allocatedBudgetMinorUnits: 50000,
      maxConcurrentCalls: 10,
    });
    await budgetRepoL.provisionLedger({
      organizationId: tenantB.organizationId,
      allocatedBudgetMinorUnits: 50000,
      maxConcurrentCalls: 10,
    });

    const attA1 = await createPreparedAttempt(tenantA, 'ga-1');
    const attB1 = await createPreparedAttempt(tenantB, 'gb-1');
    const attA2 = await createPreparedAttempt(tenantA, 'ga-2');

    const resA1 = await budgetRepoL.reserveBudget({
      organizationId: tenantA.organizationId,
      attemptId: attA1.id,
      jobId: attA1.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: attA1.idempotencyKey,
    });
    expect(resA1.kind).toBe('RESERVED');

    const resB1 = await budgetRepoR.reserveBudget({
      organizationId: tenantB.organizationId,
      attemptId: attB1.id,
      jobId: attB1.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: attB1.idempotencyKey,
    });
    expect(resB1.kind).toBe('RESERVED');

    // 3rd concurrent call across platform should be blocked by global concurrency
    const resA2 = await budgetRepoL.reserveBudget({
      organizationId: tenantA.organizationId,
      attemptId: attA2.id,
      jobId: attA2.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: attA2.idempotencyKey,
    });
    expect(resA2.kind).toBe('GLOBAL_CONCURRENCY_LIMIT_REACHED');

    // When attA1 is settled, capacity is freed and attA2 can reserve
    await budgetRepoL.settleBudget({
      organizationId: tenantA.organizationId,
      attemptId: attA1.id,
      actualCarrierCostMinorUnits: 40,
      actualConversationalCostMinorUnits: 40,
    });

    const retryA2 = await budgetRepoL.reserveBudget({
      organizationId: tenantA.organizationId,
      attemptId: attA2.id,
      jobId: attA2.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: attA2.idempotencyKey,
    });
    expect(retryA2.kind).toBe('RESERVED');

    await budgetRepoL.releaseBudget({
      organizationId: tenantB.organizationId,
      attemptId: attB1.id,
      reason: 'TEST_CLEANUP',
    });
    await budgetRepoL.releaseBudget({
      organizationId: tenantA.organizationId,
      attemptId: attA2.id,
      reason: 'TEST_CLEANUP',
    });
  });

  it('settles overage truthfully even when actual cost exceeds allocated budget and blocks new admissions', async () => {
    // Increase global concurrency
    await budgetRepoL.provisionGlobalLedger({
      currency: 'USD',
      allocatedBudgetMinorUnits: 1000000,
      maxConcurrentCalls: 100,
    });

    const tenantDeficit = await createTenant(left.db, {
      runId: fx.runId,
      userId: fx.userId,
      tag: 'deficit',
    });
    const orgId = tenantDeficit.organizationId;

    // Tenant has $10.00 (1000 minor units) allocated
    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 1000,
      maxConcurrentCalls: 5,
      maxDailyAttempts: 50,
    });

    const att1 = await createPreparedAttempt(tenantDeficit, 'over-1');
    const reserved = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att1.id,
      jobId: att1.jobId,
      estimatedAmountMinorUnits: 500, // $5.00 reserved
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 250,
      idempotencyKey: att1.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');

    // Call runs long and actual cost is $15.00 (1500 minor units: carrier 800 + conversational 700)
    // This exceeds the $5.00 reservation AND exceeds the entire $10.00 allocated budget!
    const settled = await budgetRepoL.settleBudget({
      organizationId: orgId,
      attemptId: att1.id,
      actualCarrierCostMinorUnits: 800,
      actualConversationalCostMinorUnits: 700,
    });

    expect(settled.kind).toBe('SETTLED');
    if (settled.kind !== 'SETTLED') return;

    expect(settled.totalSettledMinorUnits).toBe(1500);
    expect(settled.unusedReservationRefundedMinorUnits).toBe(0);
    expect(settled.overageMinorUnits).toBe(1000); // 1500 - 500 = 1000 overage
    expect(settled.reservation.status).toBe('COMMITTED');

    // Check ledger state: spent is 1500, reserved is 0, allocated is 1000
    // Solvency invariant holds (allocated >= reserved), available budget is 0
    const ledger = await budgetRepoL.getLedger(orgId);
    expect(ledger?.spentAmountMinorUnits).toBe(1500);
    expect(ledger?.spentCarrierMinorUnits).toBe(800);
    expect(ledger?.spentConversationalMinorUnits).toBe(700);
    expect(ledger?.reservedAmountMinorUnits).toBe(0);
    expect(ledger?.availableAmountMinorUnits).toBe(0);

    // Any new reservation must fail-closed because ledger is in deficit
    const att2 = await createPreparedAttempt(tenantDeficit, 'over-2');
    const blockedRes = await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att2.id,
      jobId: att2.jobId,
      estimatedAmountMinorUnits: 100,
      estimatedCarrierMinorUnits: 50,
      estimatedConversationalMinorUnits: 50,
      idempotencyKey: att2.idempotencyKey,
    });
    expect(blockedRes.kind).toBe('INSUFFICIENT_FUNDS');
    if (blockedRes.kind === 'INSUFFICIENT_FUNDS') {
      expect(blockedRes.availableMinorUnits).toBe(0);
    }
  });

  it('guarantees settlement and release state machine transitions and idempotency', async () => {
    const tenantSM = await createTenant(left.db, {
      runId: fx.runId,
      userId: fx.userId,
      tag: 'sm',
    });
    const orgId = tenantSM.organizationId;
    await budgetRepoL.provisionLedger({
      organizationId: orgId,
      allocatedBudgetMinorUnits: 10000,
      maxConcurrentCalls: 5,
    });

    const att1 = await createPreparedAttempt(tenantSM, 'sm-1');
    await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att1.id,
      jobId: att1.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 250,
      idempotencyKey: att1.idempotencyKey,
    });

    // Settle attempt
    const settle1 = await budgetRepoL.settleBudget({
      organizationId: orgId,
      attemptId: att1.id,
      actualCarrierCostMinorUnits: 200,
      actualConversationalCostMinorUnits: 200,
    });
    expect(settle1.kind).toBe('SETTLED');

    // Duplicate settlement returns ALREADY_SETTLED
    const settle2 = await budgetRepoL.settleBudget({
      organizationId: orgId,
      attemptId: att1.id,
      actualCarrierCostMinorUnits: 200,
      actualConversationalCostMinorUnits: 200,
    });
    expect(settle2.kind).toBe('ALREADY_SETTLED');

    // Cannot release already settled reservation
    const releaseAttempt = await budgetRepoL.releaseBudget({
      organizationId: orgId,
      attemptId: att1.id,
      reason: 'LATE_RELEASE',
    });
    expect(releaseAttempt.kind).toBe('ALREADY_SETTLED');

    // Settle on released reservation test
    const att2 = await createPreparedAttempt(tenantSM, 'sm-2');
    await budgetRepoL.reserveBudget({
      organizationId: orgId,
      attemptId: att2.id,
      jobId: att2.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 250,
      estimatedConversationalMinorUnits: 250,
      idempotencyKey: att2.idempotencyKey,
    });

    const rel1 = await budgetRepoL.releaseBudget({
      organizationId: orgId,
      attemptId: att2.id,
      reason: 'FAILED',
    });
    expect(rel1.kind).toBe('RELEASED');

    // Duplicate release returns ALREADY_RELEASED
    const rel2 = await budgetRepoL.releaseBudget({
      organizationId: orgId,
      attemptId: att2.id,
      reason: 'FAILED_AGAIN',
    });
    expect(rel2.kind).toBe('ALREADY_RELEASED');

    // Cannot settle already released reservation
    const lateSettle = await budgetRepoL.settleBudget({
      organizationId: orgId,
      attemptId: att2.id,
      actualCarrierCostMinorUnits: 100,
      actualConversationalCostMinorUnits: 100,
    });
    expect(lateSettle.kind).toBe('RESERVATION_ALREADY_RELEASED');
  });

  it('rejects origination when estimated cost is unverified or non-positive (fail-closed)', async () => {
    const orgId = fx.tenantA.organizationId;
    const attempt = await createPreparedAttempt(fx.tenantA, 'unverified-cost');

    const fakeOrigination: TelephonyOriginationPort = {
      providerName: 'fake_carrier',
      originate: async () => ({ kind: 'ACCEPTED', providerReference: 'call_1' }),
    };
    const fakeReconciliation: TelephonyReconciliationPort = {
      reconcile: async () => {
        throw new Error('Not used');
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

    // 1. Without options -> fails closed
    const resNoOptions = await guardedRunner.originate({
      organizationId: orgId,
      attemptId: attempt.id,
    });
    expect(resNoOptions).toEqual({
      kind: 'NOT_SENT',
      reason: 'ESTIMATED_COST_REQUIRED',
    });

    // 2. With zero carrier cost -> fails closed
    const resZeroCarrier = await guardedRunner.originate(
      {
        organizationId: orgId,
        attemptId: attempt.id,
      },
      {
        estimatedCarrierMinorUnits: 0,
        estimatedConversationalMinorUnits: 200,
      },
    );
    expect(resZeroCarrier).toEqual({
      kind: 'NOT_SENT',
      reason: 'ESTIMATED_COST_REQUIRED',
    });
  });

  it('rejects cross-tenant reservation (attempt of tenant A with tenant B organization)', async () => {
    const tenantA = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 'cta' });
    const tenantB = await createTenant(left.db, { runId: fx.runId, userId: fx.userId, tag: 'ctb' });

    await budgetRepoL.provisionLedger({
      organizationId: tenantB.organizationId,
      allocatedBudgetMinorUnits: 10000,
    });

    const attemptA = await createPreparedAttempt(tenantA, 'cross-1');

    // Attempting to reserve attempt of Tenant A under Tenant B organization fails FK constraint
    await expect(
      budgetRepoL.reserveBudget({
        organizationId: tenantB.organizationId,
        attemptId: attemptA.id,
        jobId: attemptA.jobId,
        estimatedAmountMinorUnits: 200,
        estimatedCarrierMinorUnits: 100,
        estimatedConversationalMinorUnits: 100,
        idempotencyKey: attemptA.idempotencyKey,
      }),
    ).rejects.toThrow();
  });
});
