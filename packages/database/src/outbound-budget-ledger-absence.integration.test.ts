import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { OutboundBudgetLedgerMissingError } from './repositories/outbound-budget-ledger-presence.js';
import {
  findReservationByAttemptId,
  GLOBAL_BUDGET_LEDGER_ID,
} from './repositories/outbound-budget-queries.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { OutboundPersistenceTechnicalError } from './repositories/outbound-persistence-errors.js';
import { outboundBudgetLedgers } from './schema/outbound-budget-ledgers.js';
import { platformGlobalBudgetLedgers } from './schema/platform-global-budget-ledger.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  createTenant,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('outbound-budget-ledger-absence');

const GLOBAL_PROVISION = {
  currency: 'USD',
  allocatedBudgetMinorUnits: 10000000,
  maxConcurrentCalls: 500,
} as const;

describe('008-OF3 financial mutations fail closed when a budget ledger is missing', () => {
  const db = tdb.db;
  const budget = new DrizzleOutboundBudgetRepository(db);
  const attempts = new DrizzleCallAttemptRepository(db);

  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
    await budget.provisionGlobalLedger(GLOBAL_PROVISION);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function provisionTenant(tag: string): Promise<TenantFixture> {
    const tenant = await createTenant(db, { runId: fx.runId, userId: fx.userId, tag });
    await budget.provisionLedger({
      organizationId: tenant.organizationId,
      allocatedBudgetMinorUnits: 5000,
      maxConcurrentCalls: 5,
      maxDailyAttempts: 50,
    });
    return tenant;
  }

  async function reserveFirstAttempt(tenant: TenantFixture, tag: string) {
    const jobId = await createExtraJob(db, { tenant, tag });
    const attemptId = randomUUID();
    const prepared = await attempts.prepareAttempt({
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
    const attempt = prepared.record.attempt;
    const outcome = await budget.reserveBudget({
      organizationId: tenant.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(outcome.kind).toBe('RESERVED');
    return attempt;
  }

  async function expectFailClosed(
    operation: Promise<unknown>,
    scope: 'GLOBAL' | 'TENANT',
  ): Promise<void> {
    const failure: unknown = await operation.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OutboundPersistenceTechnicalError);
    const cause = (failure as Error).cause;
    expect(cause).toBeInstanceOf(OutboundBudgetLedgerMissingError);
    expect((cause as OutboundBudgetLedgerMissingError).scope).toBe(scope);
  }

  async function expectReservationStillPending(tenant: TenantFixture, attemptId: string) {
    const persisted = await findReservationByAttemptId(db, tenant.organizationId, attemptId);
    expect(persisted?.status).toBe('RESERVED');
    expect(persisted?.settledAt ?? null).toBeNull();
    expect(persisted?.releasedAt ?? null).toBeNull();
  }

  it('aborts settlement when the tenant ledger is missing and keeps the reservation pending', async () => {
    const tenant = await provisionTenant('missing-tenant-ledger');
    const attempt = await reserveFirstAttempt(tenant, 'missing-tenant-ledger');

    await db
      .delete(outboundBudgetLedgers)
      .where(eq(outboundBudgetLedgers.organizationId, tenant.organizationId));

    await expectFailClosed(
      budget.settleBudget({
        organizationId: tenant.organizationId,
        attemptId: attempt.id,
        actualCarrierCostMinorUnits: 150,
        actualConversationalCostMinorUnits: 100,
      }),
      'TENANT',
    );
    await expectReservationStillPending(tenant, attempt.id);
  });

  it('aborts settlement when the global ledger is missing and keeps the reservation pending', async () => {
    const tenant = await provisionTenant('missing-global-ledger');
    const attempt = await reserveFirstAttempt(tenant, 'missing-global-ledger');

    await db
      .delete(platformGlobalBudgetLedgers)
      .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID));

    try {
      await expectFailClosed(
        budget.settleBudget({
          organizationId: tenant.organizationId,
          attemptId: attempt.id,
          actualCarrierCostMinorUnits: 150,
          actualConversationalCostMinorUnits: 100,
        }),
        'GLOBAL',
      );
      await expectReservationStillPending(tenant, attempt.id);
    } finally {
      await budget.provisionGlobalLedger(GLOBAL_PROVISION);
    }
  });

  it('aborts release when the tenant ledger is missing and keeps the reservation pending', async () => {
    const tenant = await provisionTenant('missing-tenant-release');
    const attempt = await reserveFirstAttempt(tenant, 'missing-tenant-release');

    await db
      .delete(outboundBudgetLedgers)
      .where(eq(outboundBudgetLedgers.organizationId, tenant.organizationId));

    await expectFailClosed(
      budget.releaseBudget({
        organizationId: tenant.organizationId,
        attemptId: attempt.id,
        reason: 'ORIGINATION_ABORTED',
      }),
      'TENANT',
    );
    await expectReservationStillPending(tenant, attempt.id);
  });
});
