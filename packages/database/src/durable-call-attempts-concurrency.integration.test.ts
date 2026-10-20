import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('durable-call-attempts-concurrency');

/**
 * Concorrência real: dois pools independentes (= dois processos de worker do
 * ponto de vista do PostgreSQL) disparados com Promise.all após uma barreira.
 */
describe('008-OF2 real PostgreSQL concurrency', () => {
  const left = { db: tdb.db };
  const right = createDatabaseConnection({ connectionString: tdb.url });
  const repoL = new DrizzleCallAttemptRepository(left.db);
  const repoR = new DrizzleCallAttemptRepository(right.db);
  const t0 = new Date('2026-10-20T12:00:00.000Z');
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(left.db);
  });

  afterAll(async () => {
    await right.pool.end();
    await tdb.drop();
  });

  async function barrier<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const running = tasks.map(async (task) => {
      await gate;
      return task();
    });
    release();
    return Promise.all(running);
  }

  function prepareWith(repo: DrizzleCallAttemptRepository, tenant: TenantFixture) {
    return repo.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId: tenant.jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: t0,
    });
  }

  function claim(repo: DrizzleCallAttemptRepository, attemptId: string, ownerId: string) {
    return repo.claimSend({
      organizationId: fx.tenantA.organizationId,
      attemptId,
      ownerId,
      leaseMs: 30_000,
      eventId: randomUUID(),
      now: t0,
    });
  }

  it('two clients preparing for the same job: exactly one attempt #1 is created', async () => {
    const results = await barrier([
      () => prepareWith(repoL, fx.tenantA),
      () => prepareWith(repoR, fx.tenantA),
    ]);
    const prepared = results.filter((r) => r.kind === 'PREPARED');
    expect(prepared).toHaveLength(1);
    const blocked = results.find((r) => r.kind === 'BLOCKED');
    expect(blocked && 'reason' in blocked ? blocked.reason : null).toMatch(
      /ACTIVE_ATTEMPT_IN_PROGRESS|CONCURRENT_ATTEMPT_CONFLICT/,
    );
    const all = await repoL.listByJob({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
    });
    expect(all.map((r) => r.attempt.attemptNumber)).toEqual([1]);
  });

  it('two workers claiming the same send: exactly one authority wins', async () => {
    const [attempt] = await repoL.listByJob({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
    });
    const id = attempt!.attempt.id;
    const results = await barrier([
      () => claim(repoL, id, 'worker-L'),
      () => claim(repoR, id, 'worker-R'),
    ]);
    const winners = results.filter((r) => r.kind === 'CLAIMED');
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'REJECTED')).toHaveLength(1);
    const stored = await repoL.getById({
      organizationId: fx.tenantA.organizationId,
      attemptId: id,
    });
    expect(stored?.attempt.state).toBe('ORIGINATION_SENT');
    expect(stored?.claimOwner).toBe(
      winners[0]!.kind === 'CLAIMED' ? winners[0]!.fence.ownerId : '',
    );
    expect(stored?.attempt.originationAuthorityId).toBe(stored?.claimOwner);
  });

  it('two concurrent completions from the same version: one transition, the other is stale/duplicate-safe', async () => {
    const [attempt] = await repoL.listByJob({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
    });
    const record = await repoL.getById({
      organizationId: fx.tenantA.organizationId,
      attemptId: attempt!.attempt.id,
    });
    const fence = { ownerId: record!.claimOwner!, fencingToken: record!.fencingToken };
    const complete = (repo: DrizzleCallAttemptRepository, kind: 'ACCEPTED' | 'REJECTED') =>
      repo.completeOrigination({
        organizationId: fx.tenantA.organizationId,
        attemptId: attempt!.attempt.id,
        fence,
        result: kind === 'ACCEPTED' ? { kind } : { kind, reasonCode: 'PROVIDER_REFUSED' },
        eventId: randomUUID(),
        now: t0,
      });
    const results = await barrier([
      () => complete(repoL, 'ACCEPTED'),
      () => complete(repoR, 'REJECTED'),
    ]);
    expect(results.filter((r) => r.kind === 'APPLIED')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'FENCED')).toHaveLength(1);
    const stored = await repoL.getById({
      organizationId: fx.tenantA.organizationId,
      attemptId: attempt!.attempt.id,
    });
    expect(['ORIGINATION_ACCEPTED', 'ORIGINATION_REJECTED']).toContain(stored?.attempt.state);
    expect(stored?.stateVersion).toBe(record!.stateVersion + 1);
  });

  it('two recoverers after a crash never take the same attempt; stale owner is fenced', async () => {
    const prepared = await prepareWith(repoL, fx.tenantB);
    if (prepared.kind !== 'PREPARED') throw new Error('expected PREPARED');
    const scope = {
      organizationId: fx.tenantB.organizationId,
      attemptId: prepared.record.attempt.id,
    };
    const sent = await repoL.claimSend({
      ...scope,
      ownerId: 'dead-worker',
      leaseMs: 1_000,
      eventId: randomUUID(),
      now: t0,
    });
    if (sent.kind !== 'CLAIMED') throw new Error('expected CLAIMED');
    const later = new Date(t0.getTime() + 60_000);
    const recover = (repo: DrizzleCallAttemptRepository, owner: string) =>
      repo.recoverInterrupted({
        organizationId: fx.tenantB.organizationId,
        recoveryOwnerId: owner,
        now: later,
        limit: 10,
        newEventId: randomUUID,
      });
    const reports = await barrier([
      () => recover(repoL, 'recovery-L'),
      () => recover(repoR, 'recovery-R'),
    ]);
    const recoveredIds = reports.flatMap((r) => r.recovered.map((x) => x.attemptId));
    expect(recoveredIds).toEqual([scope.attemptId]);
    const late = await repoL.completeOrigination({
      ...scope,
      fence: sent.fence,
      result: { kind: 'ACCEPTED' },
      eventId: randomUUID(),
      now: later,
    });
    expect(late.kind).toBe('FENCED');
    const stored = await repoL.getById(scope);
    expect(stored?.attempt.state).toBe('OUTCOME_UNKNOWN');
    expect(await prepareWith(repoR, fx.tenantB)).toEqual({
      kind: 'BLOCKED',
      reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL',
    });
  });

  it('an unexpired lease is never recovered and never re-claimed for sending', async () => {
    const [current] = await repoL.listByJob({
      organizationId: fx.tenantB.organizationId,
      jobId: fx.tenantB.jobId,
    });
    const scope = { organizationId: fx.tenantB.organizationId, attemptId: current!.attempt.id };
    const recon = await repoL.claimReconciliation({
      ...scope,
      ownerId: 'rec-1',
      leaseMs: 30_000,
      eventId: randomUUID(),
      now: t0,
    });
    expect(recon.kind).toBe('CLAIMED');
    const second = await repoR.claimReconciliation({
      ...scope,
      ownerId: 'rec-2',
      leaseMs: 30_000,
      eventId: randomUUID(),
      now: t0,
    });
    expect(second).toEqual({ kind: 'REJECTED', reason: 'CLAIM_HELD_BY_ANOTHER_OWNER' });
    const resend = await repoR.claimSend({
      ...scope,
      ownerId: 'w',
      leaseMs: 1,
      eventId: randomUUID(),
      now: t0,
    });
    expect(resend).toEqual({ kind: 'REJECTED', reason: 'NOT_CLAIMABLE_IN_STATE' });
  });
});
