import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TelephonyOriginationPort } from '@voice-agent/contracts';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('outbound-budget-release-evidence');

/** 008-OF3 (D): liberar orçamento/capacidade exige evidência de NÃO envio. */
describe('008-OF3 release requires proof that the attempt was never sent', () => {
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const cost = { estimatedCarrierMinorUnits: 300, estimatedConversationalMinorUnits: 200 };
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    await budget.provisionGlobalLedger({
      allocatedBudgetMinorUnits: 1_000_000,
      maxConcurrentCalls: 500,
    });
    await budget.provisionLedger({
      organizationId: fx.tenantA.organizationId,
      allocatedBudgetMinorUnits: 100_000,
      maxConcurrentCalls: 100,
      maxDailyAttempts: 1000,
    });
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function reservedAttempt(tag: string) {
    const jobId = await createExtraJob(tdb.db, { tenant: fx.tenantA, tag });
    const prepared = await attempts.prepareAttempt({
      organizationId: fx.tenantA.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const attempt = prepared.record.attempt;
    const reserved = await budget.reserveBudget({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      estimatedAmountMinorUnits: 500,
      ...cost,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');
    return { organizationId: attempt.organizationId, attemptId: attempt.id };
  }

  const claim = (scope: { organizationId: string; attemptId: string }) =>
    attempts.claimSend({
      ...scope,
      ownerId: 'worker-a',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: new Date(),
    });

  it('cancels a never-sent attempt atomically so a later send claim is refused', async () => {
    const scope = await reservedAttempt('pending');
    const released = await budget.releaseBudget({ ...scope, reason: 'ABORTED_BEFORE_SEND' });
    expect(released.kind).toBe('RELEASED');
    expect((await attempts.getById(scope))?.attempt.state).toBe('CANCELED');
    expect(await claim(scope)).toEqual({ kind: 'REJECTED', reason: 'NOT_CLAIMABLE_IN_STATE' });
  });

  it.each([
    ['SEND_STARTED', null],
    ['ACCEPTED', { kind: 'ACCEPTED', providerReference: 'ref-1' }],
    ['OUTCOME_UNKNOWN', { kind: 'UNKNOWN', reasonCode: 'TIMEOUT' }],
  ] as const)('keeps funds and capacity encumbered after %s', async (_label, result) => {
    const scope = await reservedAttempt(`sent-${_label}`);
    const claimed = await claim(scope);
    if (claimed.kind !== 'CLAIMED') throw new Error(claimed.reason);
    if (result) {
      await attempts.completeOrigination({
        ...scope,
        fence: claimed.fence,
        result,
        eventId: randomUUID(),
        now: new Date(),
      });
    }
    const before = await budget.getLedger(scope.organizationId);
    const released = await budget.releaseBudget({ ...scope, reason: 'CALLER_ERROR' });
    expect(released.kind).toBe('RELEASE_BLOCKED_ATTEMPT_NOT_PROVEN_UNSENT');
    if (released.kind === 'RELEASE_BLOCKED_ATTEMPT_NOT_PROVEN_UNSENT') {
      expect(released.reservation.status).toBe('RESERVED');
      expect(released.attemptState).not.toBe('CANCELED');
    }
    expect((await budget.getLedger(scope.organizationId))?.reservedAmountMinorUnits).toBe(
      before?.reservedAmountMinorUnits,
    );
  });

  it('releases once a confirmed rejection proves no call was created', async () => {
    const scope = await reservedAttempt('rejected');
    const claimed = await claim(scope);
    if (claimed.kind !== 'CLAIMED') throw new Error(claimed.reason);
    await attempts.completeOrigination({
      ...scope,
      fence: claimed.fence,
      result: { kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' },
      eventId: randomUUID(),
      now: new Date(),
    });
    expect((await budget.releaseBudget({ ...scope, reason: 'REJECTED' })).kind).toBe('RELEASED');
  });

  it('a worker that loses the send claim never releases the live reservation', async () => {
    const scope = await reservedAttempt('race');
    let calls = 0;
    let unblock!: () => void;
    const hold = new Promise<void>((resolve) => (unblock = resolve));
    const origination: TelephonyOriginationPort = {
      providerName: 'fake-slow',
      originate: async () => {
        calls += 1;
        await hold;
        return { kind: 'ACCEPTED', providerReference: 'live' };
      },
    };
    const guarded = (ownerId: string) =>
      new DurableGuardedOriginationRunner({
        runner: new DurableOutboundOriginationRunner({
          db: tdb.db,
          attempts,
          origination,
          reconciliation: {
            reconcile: async () => ({ kind: 'INCONCLUSIVE' }),
          },
          ownerId,
          leaseMs: 60_000,
          now: () => new Date(),
          newEventId: () => randomUUID(),
        }),
        attempts,
        budget,
      });
    const winner = guarded('worker-a').originate(scope, cost);
    while (calls === 0) await new Promise((r) => setTimeout(r, 10));
    const loser = await guarded('worker-b').originate(scope, cost);
    expect(loser.kind).toBe('NOT_SENT');
    const blocked = await budget.releaseBudget({ ...scope, reason: 'PROBE' });
    expect(blocked.kind).toBe('RELEASE_BLOCKED_ATTEMPT_NOT_PROVEN_UNSENT');
    unblock();
    expect((await winner).kind).toBe('COMPLETED');
    expect(calls).toBe(1);
  });
});
