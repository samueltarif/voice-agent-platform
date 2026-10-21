import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallEventTrailRepository } from './repositories/call-event-trail-repository.js';
import { buildInternalAttemptEvent } from './repositories/durable-attempt-event-factory.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('durable-call-attempts');

describe('008-OF2 durable call attempts (PostgreSQL)', () => {
  const db = tdb.db;
  const attempts = new DrizzleCallAttemptRepository(db);
  const trail = new DrizzleCallEventTrailRepository(db);
  const now = new Date('2026-10-20T12:00:00.000Z');
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  function prepare(tenant: TenantFixture, attemptId: string = randomUUID()) {
    return attempts.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId: tenant.jobId,
      attemptId,
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now,
    });
  }

  function event(
    record: { attempt: { id: string; organizationId: string; jobId: string } },
    type: string,
    extra = {},
  ) {
    return buildInternalAttemptEvent({
      attempt: record.attempt,
      type: type as never,
      eventId: randomUUID(),
      now,
      extra,
    });
  }

  it('prepares attempt #1 server-side from the job and records the intent atomically', async () => {
    const result = await prepare(fx.tenantA);
    expect(result.kind).toBe('PREPARED');
    if (result.kind !== 'PREPARED') return;
    const { attempt } = result.record;
    expect(attempt.state).toBe('ORIGINATION_PENDING');
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.organizationId).toBe(fx.tenantA.organizationId);
    expect(attempt.agentVersionId).toBe(fx.tenantA.agentVersionId);
    expect(attempt.idempotencyKey).toMatch(/-att-1$/);
    expect(attempt.appliedEventIds).toHaveLength(1);
    const events = await trail.listByAttempt({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
    });
    expect(events.map((e) => [e.eventType, e.applicationResult])).toEqual([
      ['INTENT_RECORDED', 'APPLIED'],
    ]);
  });

  it('blocks a second open attempt for the same job (no blind successor)', async () => {
    expect(await prepare(fx.tenantA)).toEqual({
      kind: 'BLOCKED',
      reason: 'ACTIVE_ATTEMPT_IN_PROGRESS',
    });
  });

  it('rejects a job of another tenant (server-side scope)', async () => {
    const crossed = await attempts.prepareAttempt({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantB.jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now,
    });
    expect(crossed).toEqual({ kind: 'BLOCKED', reason: 'JOB_NOT_FOUND' });
  });

  it('applies events transactionally: duplicate, conflicting replay, stale and terminal', async () => {
    const prepared = await prepare(fx.tenantB);
    if (prepared.kind !== 'PREPARED') throw new Error('expected PREPARED');
    const scope = {
      organizationId: fx.tenantB.organizationId,
      attemptId: prepared.record.attempt.id,
    };
    const send = event(prepared.record, 'SEND_STARTED', { authorityId: 'worker-1' });
    const first = await attempts.applyEvent({ ...scope, event: send, now });
    expect(first.kind).toBe('APPLIED');
    expect((await attempts.applyEvent({ ...scope, event: send, now })).kind).toBe('DUPLICATE');
    const conflicting = { ...send, authorityId: 'worker-2' };
    expect((await attempts.applyEvent({ ...scope, event: conflicting, now })).kind).toBe(
      'EVENT_ID_CONFLICT',
    );

    const rejected = event(prepared.record, 'ORIGINATION_REJECTED', {
      reasonCode: 'PROVIDER_REFUSED',
    });
    expect((await attempts.applyEvent({ ...scope, event: rejected, now })).kind).toBe('APPLIED');
    const lateUnknown = event(prepared.record, 'ORIGINATION_RESULT_UNKNOWN', {
      reasonCode: 'TIMEOUT',
    });
    const late = await attempts.applyEvent({ ...scope, event: lateUnknown, now });
    expect(late.kind).toBe('STALE');
    const reopen = event(prepared.record, 'RECONCILIATION_REQUESTED');
    const terminal = await attempts.applyEvent({ ...scope, event: reopen, now });
    expect(terminal.kind === 'REJECTED' || terminal.kind === 'STALE').toBe(true);
    const stored = await attempts.getById(scope);
    expect(stored?.attempt.state).toBe('ORIGINATION_REJECTED');
    expect(stored?.stateVersion).toBe(4);

    const rebuilt = await trail.rebuildAttempt(scope);
    expect(rebuilt?.attempt.state).toBe('ORIGINATION_REJECTED');
    expect(rebuilt?.attempt.originationAuthorityId).toBe('worker-1');
    expect(rebuilt?.replayedEvents).toBe(3);
  });

  it('allows a successor (#2) only after a confirmed non-origination outcome', async () => {
    const next = await prepare(fx.tenantB);
    expect(next.kind).toBe('PREPARED');
    if (next.kind === 'PREPARED') expect(next.record.attempt.attemptNumber).toBe(2);
  });

  it('rejects cross-tenant events without recording them in the local trail', async () => {
    const [current] = await attempts.listByJob({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
    });
    if (!current) throw new Error('missing attempt');
    const scope = { organizationId: fx.tenantA.organizationId, attemptId: current.attempt.id };
    const foreign = {
      ...event(current, 'CANCEL_REQUESTED'),
      organizationId: fx.tenantB.organizationId,
    };
    const result = await attempts.applyEvent({ ...scope, event: foreign, now });
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'TENANT_MISMATCH' });
    const fromB = await attempts.getById({
      organizationId: fx.tenantB.organizationId,
      attemptId: current.attempt.id,
    });
    expect(fromB).toBeNull();
    const events = await trail.listByAttempt(scope);
    expect(events.every((e) => e.eventType !== 'CANCEL_REQUESTED')).toBe(true);
  });

  it('reuse of an attemptId (even from another tenant) is refused without leaking ownership', async () => {
    const [current] = await attempts.listByJob({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
    });
    const reuse = await prepare(fx.tenantB, current!.attempt.id);
    expect(reuse).toEqual({ kind: 'BLOCKED', reason: 'ATTEMPT_ID_ALREADY_EXISTS' });
  });
});
