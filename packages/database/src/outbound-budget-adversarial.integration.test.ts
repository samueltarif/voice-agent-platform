import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseInstance } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  createTenant,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('outbound-budget-adversarial');
const UNIT = 100;

/** 008-OF3 (E): competidores reais em pools LIMITADOS contra o último saldo global. */
describe('008-OF3 adversarial budget concurrency', () => {
  const pools = [0, 1].map(() =>
    createDatabaseConnection({ connectionString: tdb.url, maxConnections: 4 }),
  );
  const repos = pools.map((p) => new DrizzleOutboundBudgetRepository(p.db));
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    await budget.provisionGlobalLedger({
      allocatedBudgetMinorUnits: 0,
      maxConcurrentCalls: 10_000,
    });
  });

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.pool.end()));
    await tdb.drop();
  });

  async function tenant(tag: string): Promise<TenantFixture> {
    const t = await createTenant(tdb.db, { runId: fx.runId, userId: fx.userId, tag });
    await budget.provisionLedger({
      organizationId: t.organizationId,
      allocatedBudgetMinorUnits: 1_000_000,
      maxConcurrentCalls: 1000,
      maxDailyAttempts: 1000,
    });
    return t;
  }

  async function prepared(db: DatabaseInstance, t: TenantFixture, tag: string) {
    const jobId = await createExtraJob(db, { tenant: t, tag });
    const result = await new DrizzleCallAttemptRepository(db).prepareAttempt({
      organizationId: t.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (result.kind !== 'PREPARED') throw new Error(result.reason);
    return result.record.attempt;
  }

  const reserveInput = (a: Awaited<ReturnType<typeof prepared>>) => ({
    organizationId: a.organizationId,
    attemptId: a.id,
    jobId: a.jobId,
    estimatedAmountMinorUnits: UNIT,
    estimatedCarrierMinorUnits: 60,
    estimatedConversationalMinorUnits: 40,
    idempotencyKey: a.idempotencyKey,
  });

  it.each([2, 10, 100])(
    '%i competitors from two tenants never overdraw the last global units',
    async (competitors) => {
      const [left, right] = [await tenant(`l${competitors}`), await tenant(`r${competitors}`)];
      const attempts = await Promise.all(
        Array.from({ length: competitors }, (_, i) =>
          prepared(tdb.db, i % 2 ? right : left, `c${competitors}-${i}`),
        ),
      );
      const before = await budget.getGlobalLedger();
      const winners = Math.floor(competitors / 2);
      const committed =
        (before?.reservedAmountMinorUnits ?? 0) + (before?.spentAmountMinorUnits ?? 0);
      await budget.provisionGlobalLedger({
        allocatedBudgetMinorUnits: committed + winners * UNIT + (UNIT - 1),
        maxConcurrentCalls: 10_000,
      });

      const outcomes = await Promise.all(
        attempts.map((a, i) => repos[i % 2]!.reserveBudget(reserveInput(a))),
      );

      const reserved = outcomes.filter((o) => o.kind === 'RESERVED').length;
      expect(reserved).toBe(winners);
      expect(
        outcomes.every((o) => o.kind === 'RESERVED' || o.kind === 'GLOBAL_INSUFFICIENT_FUNDS'),
      ).toBe(true);
      const after = await budget.getGlobalLedger();
      expect(after?.reservedAmountMinorUnits).toBe(
        (before?.reservedAmountMinorUnits ?? 0) + winners * UNIT,
      );
    },
    60_000,
  );

  it('serializes duplicate reservations of the same attempt without errors or double encumbrance', async () => {
    const t = await tenant('dup');
    const attempt = await prepared(tdb.db, t, 'dup');
    await budget.provisionGlobalLedger({
      allocatedBudgetMinorUnits: 100_000_000,
      maxConcurrentCalls: 10_000,
    });
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, i) => repos[i % 2]!.reserveBudget(reserveInput(attempt))),
    );
    expect(outcomes.filter((o) => o.kind === 'RESERVED')).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === 'ALREADY_RESERVED')).toHaveLength(9);
    expect((await budget.getLedger(t.organizationId))?.reservedAmountMinorUnits).toBe(UNIT);
  });

  it('survives a process restart between reservation and send without leaking or duplicating funds', async () => {
    const t = await tenant('restart');
    const crashed = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 2 });
    const attempt = await prepared(crashed.db, t, 'restart');
    const first = await new DrizzleOutboundBudgetRepository(crashed.db).reserveBudget(
      reserveInput(attempt),
    );
    expect(first.kind).toBe('RESERVED');
    await crashed.pool.end(); // processo Node morto antes do envio

    const revived = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 2 });
    try {
      const again = await new DrizzleOutboundBudgetRepository(revived.db).reserveBudget(
        reserveInput(attempt),
      );
      expect(again.kind).toBe('ALREADY_RESERVED');
      if (again.kind === 'ALREADY_RESERVED') expect(again.reservation.status).toBe('RESERVED');
      expect((await budget.getLedger(t.organizationId))?.reservedAmountMinorUnits).toBe(UNIT);
    } finally {
      await revived.pool.end();
    }
  });
});
