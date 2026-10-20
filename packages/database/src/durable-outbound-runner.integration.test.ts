import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  TelephonyOriginationResult,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallEventTrailRepository } from './repositories/call-event-trail-repository.js';
import { buildInternalAttemptEvent } from './repositories/durable-attempt-event-factory.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  LOCAL_TEST_DATABASE_URL,
  assertLocalDatabaseUrl,
  countDurableOutboundLeftovers,
  createDurableOutboundFixture,
  createExtraJob,
  destroyDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';

assertLocalDatabaseUrl(LOCAL_TEST_DATABASE_URL);

describe('008-OF2 durable lifecycle runner with offline fakes (PostgreSQL)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: LOCAL_TEST_DATABASE_URL });
  const attempts = new DrizzleCallAttemptRepository(db);
  const trail = new DrizzleCallEventTrailRepository(db);
  const now = new Date('2026-10-20T12:00:00.000Z');
  const originations: string[] = [];
  const originationSteps: Array<TelephonyOriginationResult | 'THROW'> = [];
  const reconciliationSteps: TelephonyReconciliationResult[] = [];
  let fx: DurableOutboundFixture;

  const runner = new DurableOutboundOriginationRunner({
    db,
    attempts,
    origination: {
      providerName: 'offline-fake',
      async originate(request) {
        originations.push(request.attemptId);
        const step = originationSteps.shift() ?? { kind: 'ACCEPTED', providerReference: 'fake' };
        if (step === 'THROW') throw new Error('simulated transport failure');
        return step;
      },
    },
    reconciliation: {
      reconcile: async () => reconciliationSteps.shift() ?? { kind: 'INCONCLUSIVE' },
    },
    ownerId: 'runner-1',
    leaseMs: 30_000,
    newEventId: randomUUID,
    now: () => now,
  });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
  });

  afterAll(async () => {
    try {
      await destroyDurableOutboundFixture(db, fx);
      expect(await countDurableOutboundLeftovers(db, fx)).toBe(0);
    } finally {
      await pool.end();
    }
  });

  async function preparedOn(destinationPhone?: string) {
    const jobId = await createExtraJob(db, {
      tenant: fx.tenantA,
      tag: 'runner',
      ...(destinationPhone ? { destinationPhone } : {}),
    });
    const result = await attempts.prepareAttempt({
      organizationId: fx.tenantA.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now,
    });
    if (result.kind !== 'PREPARED') throw new Error(result.reason);
    return { organizationId: fx.tenantA.organizationId, attemptId: result.record.attempt.id };
  }

  it('accepted origination: SEND_STARTED persisted before the port, claim released after', async () => {
    const scope = await preparedOn();
    const result = await runner.originate(scope);
    expect(result.kind === 'COMPLETED' && result.outcome.kind).toBe('APPLIED');
    const stored = await attempts.getById(scope);
    expect(stored?.attempt.state).toBe('ORIGINATION_ACCEPTED');
    expect(stored?.claimOwner).toBeNull();
    expect(stored?.sendStartedAt).not.toBeNull();
    const types = (await trail.listByAttempt(scope)).map((e) => e.eventType);
    expect(types).toEqual(['INTENT_RECORDED', 'SEND_STARTED', 'ORIGINATION_ACCEPTED']);
    expect(await runner.originate(scope)).toEqual({
      kind: 'NOT_SENT',
      reason: 'NOT_CLAIMABLE_IN_STATE',
    });
    expect(originations.filter((id) => id === scope.attemptId)).toHaveLength(1);
  });

  it('invalid destination never claims nor reaches the port', async () => {
    const scope = await preparedOn('not-a-number');
    expect(await runner.originate(scope)).toEqual({ kind: 'NOT_SENT', reason: 'INVALID_REQUEST' });
    expect((await attempts.getById(scope))?.attempt.state).toBe('ORIGINATION_PENDING');
    expect(originations).not.toContain(scope.attemptId);
  });

  it('transport failure after send is OUTCOME_UNKNOWN; inconclusive then confirmed reconciliation', async () => {
    const scope = await preparedOn();
    originationSteps.push('THROW');
    await runner.originate(scope);
    expect((await attempts.getById(scope))?.attempt.state).toBe('OUTCOME_UNKNOWN');
    reconciliationSteps.push(
      { kind: 'INCONCLUSIVE' },
      { kind: 'CONFIRMED_ORIGINATED', providerReference: 'late' },
    );
    await runner.reconcile(scope);
    const inconclusive = await attempts.getById(scope);
    expect(inconclusive?.attempt.state).toBe('OUTCOME_UNKNOWN');
    expect(inconclusive?.attempt.reconciliationAttempts).toBe(1);
    await runner.reconcile(scope);
    const confirmed = await attempts.getById(scope);
    expect(confirmed?.attempt.state).toBe('ORIGINATION_ACCEPTED');
    expect(confirmed?.attempt.providerReference).toBe('late');
    const rebuilt = await trail.rebuildAttempt(scope);
    expect(rebuilt?.attempt.state).toBe(confirmed?.attempt.state);
    expect(rebuilt?.attempt.reconciliationAttempts).toBe(1);
  });

  it('closure confirmed during reconciliation closes the attempt; reconciler is then fenced', async () => {
    const scope = await preparedOn();
    originationSteps.push({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' });
    await runner.originate(scope);
    const claim = await attempts.claimReconciliation({
      ...scope,
      ownerId: 'rec',
      leaseMs: 30_000,
      eventId: randomUUID(),
      now,
    });
    if (claim.kind !== 'CLAIMED') throw new Error('expected CLAIMED');
    const closed = buildInternalAttemptEvent({
      attempt: claim.record.attempt,
      type: 'CALL_CLOSED_CONFIRMED',
      eventId: randomUUID(),
      now,
    });
    expect((await attempts.applyEvent({ ...scope, event: closed, now })).kind).toBe('APPLIED');
    const late = await attempts.completeReconciliation({
      ...scope,
      fence: claim.fence,
      result: { kind: 'CONFIRMED_NOT_ORIGINATED' },
      eventId: randomUUID(),
      now,
    });
    expect(['STALE', 'REJECTED']).toContain(late.kind);
    expect((await attempts.getById(scope))?.attempt.state).toBe('CLOSED');
  });

  it('regression: taking over an expired reconciliation claim persists the new owner and fence', async () => {
    const scope = await preparedOn();
    originationSteps.push({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' });
    await runner.originate(scope);
    const first = await attempts.claimReconciliation({
      ...scope,
      ownerId: 'r1',
      leaseMs: 1_000,
      eventId: randomUUID(),
      now,
    });
    const later = new Date(now.getTime() + 60_000);
    const second = await attempts.claimReconciliation({
      ...scope,
      ownerId: 'r2',
      leaseMs: 1_000,
      eventId: randomUUID(),
      now: later,
    });
    expect(first.kind).toBe('CLAIMED');
    expect(second.kind).toBe('CLAIMED');
    const stored = await attempts.getById(scope);
    expect(stored?.claimOwner).toBe('r2');
    expect(second.kind === 'CLAIMED' && stored?.fencingToken).toBe(
      second.kind === 'CLAIMED' ? second.fence.fencingToken : -1,
    );
  });

  it('manual review (reconciliation timeout) blocks further automatic reconciliation and redial', async () => {
    const scope = await preparedOn();
    originationSteps.push({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' });
    await runner.originate(scope);
    const record = await attempts.getById(scope);
    const timeout = buildInternalAttemptEvent({
      attempt: record!.attempt,
      type: 'RECONCILIATION_TIMED_OUT',
      eventId: randomUUID(),
      now,
    });
    expect((await attempts.applyEvent({ ...scope, event: timeout, now })).kind).toBe('APPLIED');
    expect(await runner.reconcile(scope)).toEqual({
      kind: 'NOT_SENT',
      reason: 'MANUAL_REVIEW_REQUIRED',
    });
    const candidates = await attempts.listReconciliationCandidates({
      organizationId: scope.organizationId,
      now,
      limit: 100,
    });
    expect(candidates.map((c) => c.id)).not.toContain(scope.attemptId);
  });
});
