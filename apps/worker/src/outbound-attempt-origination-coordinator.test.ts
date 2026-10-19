import { describe, expect, it } from 'vitest';
import { InMemoryOutboundAttemptStore } from './in-memory-outbound-attempt-store.js';
import { InMemoryTelephonyOriginationPort } from './in-memory-telephony-origination-port.js';
import {
  OutboundAttemptOriginationCoordinator,
  type PrepareAttemptInput,
} from './outbound-attempt-origination-coordinator.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const DESTINATION = '+15555550100';

let setupCount = 0;

function setup(authorityId = 'authority-1', shared?: InMemoryOutboundAttemptStore) {
  const store = shared ?? new InMemoryOutboundAttemptStore();
  const port = new InMemoryTelephonyOriginationPort();
  // Event ids must be globally unique (production uses random UUIDs): give every
  // coordinator instance its own id namespace so a "restarted" worker never reuses ids.
  const namespace = String(++setupCount).padStart(2, '0');
  let counter = 0;
  const idFor = (prefix: string) =>
    `${prefix}${namespace}${String(++counter).padStart(5, '0')}-0000-4000-8000-000000000000`;
  const coordinator = new OutboundAttemptOriginationCoordinator({
    store,
    origination: port,
    reconciliation: port,
    authorityId,
    newEventId: () => idFor('e'),
    now: () => new Date('2026-10-19T12:00:00.000Z'),
  });
  return { store, port, coordinator, idFor };
}

function prepareInput(attemptId: string, overrides: Partial<PrepareAttemptInput> = {}) {
  return {
    attemptId,
    organizationId: ORG_A,
    jobId: JOB,
    correlationId: '55555555-5555-4555-8555-555555555555',
    agentId: '66666666-6666-4666-8666-666666666666',
    agentVersionId: '77777777-7777-4777-8777-777777777777',
    jobIdempotencyKey: 'job-key',
    maxAttempts: 3,
    ...overrides,
  };
}

async function prepared(ctx: ReturnType<typeof setup>, attemptId: string) {
  const result = await ctx.coordinator.prepareAttempt(prepareInput(attemptId));
  if (result.kind !== 'PREPARED') throw new Error(`expected PREPARED, got ${result.kind}`);
  return result.attempt;
}

describe('simulated origination outcomes', () => {
  it('accepted: persists intent and send BEFORE the port, then ACCEPTED', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000001-0000-4000-8000-000000000000');
    expect(attempt.state).toBe('ORIGINATION_PENDING');
    ctx.port.queueOrigination({ kind: 'ACCEPTED', providerReference: 'opaque-1' });
    const result = await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    expect(result.kind).toBe('ORIGINATED');
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_ACCEPTED');
    expect(ctx.port.originations).toHaveLength(1);
    expect(ctx.port.originations[0]?.idempotencyKey).toBe('job-key-att-1');
  });

  it('rejected: terminal ORIGINATION_REJECTED', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000002-0000-4000-8000-000000000000');
    ctx.port.queueOrigination({ kind: 'REJECTED', reasonCode: 'LIMIT_EXCEEDED' });
    await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_REJECTED');
  });

  it('unknown result and thrown transport error both become OUTCOME_UNKNOWN', async () => {
    for (const step of [{ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' }, { kind: 'THROW' }] as const) {
      const ctx = setup();
      const attempt = await prepared(ctx, 'a0000003-0000-4000-8000-000000000000');
      ctx.port.queueOrigination(step);
      await ctx.coordinator.originate({
        organizationId: ORG_A,
        attemptId: attempt.id,
        destination: DESTINATION,
      });
      expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('OUTCOME_UNKNOWN');
    }
  });

  it('rejects an invalid destination before marking anything as sent', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000004-0000-4000-8000-000000000000');
    const result = await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: '123',
    });
    expect(result).toEqual({ kind: 'NOT_SENT', reason: 'INVALID_REQUEST' });
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_PENDING');
    expect(ctx.port.originations).toHaveLength(0);
  });
});

describe('repeated internal command', () => {
  it('a second originate for the same attempt never reaches the port again', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000005-0000-4000-8000-000000000000');
    const command = { organizationId: ORG_A, attemptId: attempt.id, destination: DESTINATION };
    await ctx.coordinator.originate(command);
    const again = await ctx.coordinator.originate(command);
    expect(again).toEqual({ kind: 'NOT_SENT', reason: 'ALREADY_PROCESSED' });
    expect(ctx.port.originations).toHaveLength(1);
  });
});

describe('crash between send and confirmation', () => {
  it('recovers as OUTCOME_UNKNOWN and never redials automatically', async () => {
    const shared = new InMemoryOutboundAttemptStore();
    const first = setup('authority-1', shared);
    const attempt = await prepared(first, 'a0000006-0000-4000-8000-000000000000');

    // 1-3. Worker marks the send (write-ahead), the command goes out, then the process dies
    //      before any confirmation is applied.
    await first.coordinator.markSendStarted({ organizationId: ORG_A, attemptId: attempt.id });
    await first.port.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      jobId: JOB,
      correlationId: attempt.correlationId,
      agentId: attempt.agentId,
      agentVersionId: attempt.agentVersionId,
      destination: DESTINATION as never,
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(shared.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_SENT');

    // 4. A brand-new worker (same durable store) restarts and recovers.
    const restarted = setup('authority-2', shared);
    const recovered = await restarted.coordinator.recoverInterruptedAttempts(ORG_A);
    expect(recovered).toBe(1);
    expect(shared.get(ORG_A, attempt.id)?.state).toBe('OUTCOME_UNKNOWN');

    // 5. No automatic redial: neither the same attempt nor a successor can be dialed.
    const resend = await restarted.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    expect(resend.kind).toBe('NOT_SENT');
    const successor = await restarted.coordinator.prepareAttempt(
      prepareInput('a0000007-0000-4000-8000-000000000000'),
    );
    expect(successor).toEqual({ kind: 'BLOCKED', reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL' });
    expect(restarted.port.originations).toHaveLength(0);
    expect(first.port.originations).toHaveLength(1);
  });

  it('a crash before the send mark leaves the attempt safely PENDING', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000008-0000-4000-8000-000000000000');
    expect(await ctx.coordinator.recoverInterruptedAttempts(ORG_A)).toBe(0);
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_PENDING');
  });
});

describe('reconciliation', () => {
  async function unknownAttempt(ctx: ReturnType<typeof setup>, id: string) {
    const attempt = await prepared(ctx, id);
    ctx.port.queueOrigination({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' });
    await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    return attempt.id;
  }

  it('confirmed originated -> ACCEPTED', async () => {
    const ctx = setup();
    const id = await unknownAttempt(ctx, 'a0000009-0000-4000-8000-000000000000');
    ctx.port.queueReconciliation({ kind: 'CONFIRMED_ORIGINATED', providerReference: 'late-ref' });
    await ctx.coordinator.reconcile({ organizationId: ORG_A, attemptId: id });
    const attempt = ctx.store.get(ORG_A, id);
    expect(attempt?.state).toBe('ORIGINATION_ACCEPTED');
    expect(attempt?.providerReference).toBe('late-ref');
  });

  it('confirmed not originated -> NOT_ORIGINATED, which allows a NEW attempt', async () => {
    const ctx = setup();
    const id = await unknownAttempt(ctx, 'a000000a-0000-4000-8000-000000000000');
    ctx.port.queueReconciliation({ kind: 'CONFIRMED_NOT_ORIGINATED' });
    await ctx.coordinator.reconcile({ organizationId: ORG_A, attemptId: id });
    expect(ctx.store.get(ORG_A, id)?.state).toBe('NOT_ORIGINATED');
    const next = await ctx.coordinator.prepareAttempt(
      prepareInput('a000000b-0000-4000-8000-000000000000'),
    );
    expect(next.kind).toBe('PREPARED');
  });

  it('inconclusive (or failing) reconciliation stays blocked; timeout is not authorization', async () => {
    const ctx = setup();
    const id = await unknownAttempt(ctx, 'a000000c-0000-4000-8000-000000000000');
    ctx.port.queueReconciliation({ kind: 'INCONCLUSIVE' });
    ctx.port.queueReconciliation({ kind: 'THROW' });
    await ctx.coordinator.reconcile({ organizationId: ORG_A, attemptId: id });
    await ctx.coordinator.reconcile({ organizationId: ORG_A, attemptId: id });
    await ctx.coordinator.expireReconciliation({ organizationId: ORG_A, attemptId: id });
    const attempt = ctx.store.get(ORG_A, id);
    expect(attempt?.state).toBe('OUTCOME_UNKNOWN');
    expect(attempt?.reconciliationAttempts).toBe(2);
    expect(attempt?.requiresManualReview).toBe(true);
    const next = await ctx.coordinator.prepareAttempt(
      prepareInput('a000000d-0000-4000-8000-000000000000'),
    );
    expect(next).toEqual({ kind: 'BLOCKED', reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL' });
  });
});

describe('authority and tenant boundaries', () => {
  it('a second authority cannot originate an attempt already claimed', async () => {
    const shared = new InMemoryOutboundAttemptStore();
    const first = setup('authority-1', shared);
    const attempt = await prepared(first, 'a000000e-0000-4000-8000-000000000000');
    await first.coordinator.markSendStarted({ organizationId: ORG_A, attemptId: attempt.id });
    const second = setup('authority-2', shared);
    const result = await second.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    expect(result).toEqual({ kind: 'NOT_SENT', reason: 'AUTHORITY_CONFLICT' });
    expect(second.port.originations).toHaveLength(0);
  });

  it('another tenant cannot see, originate or alter an attempt', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a000000f-0000-4000-8000-000000000000');
    const foreign = await ctx.coordinator.originate({
      organizationId: ORG_B,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    expect(foreign).toEqual({ kind: 'NOT_SENT', reason: 'NOT_FOUND' });
    expect(ctx.port.originations).toHaveLength(0);

    const crossEvent = await ctx.coordinator.applyEvent({
      organizationId: ORG_A,
      attemptId: attempt.id,
      event: {
        eventId: 'b0000001-0000-4000-8000-000000000000',
        organizationId: ORG_B,
        attemptId: attempt.id,
        jobId: JOB,
        occurredAt: '2026-10-19T12:00:00.000Z',
        type: 'CANCEL_REQUESTED',
      },
    });
    expect(crossEvent).toMatchObject({ kind: 'REJECTED', reason: 'TENANT_MISMATCH' });
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('ORIGINATION_PENDING');
  });

  it('keeps previous attempts immutable when a successor is created', async () => {
    const ctx = setup();
    const first = await prepared(ctx, 'a0000010-0000-4000-8000-000000000000');
    ctx.port.queueOrigination({ kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' });
    await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: first.id,
      destination: DESTINATION,
    });
    const before = JSON.stringify(ctx.store.get(ORG_A, first.id));
    const second = await ctx.coordinator.prepareAttempt(
      prepareInput('a0000011-0000-4000-8000-000000000000'),
    );
    expect(second).toMatchObject({ kind: 'PREPARED' });
    expect(second.kind === 'PREPARED' && second.attempt.attemptNumber).toBe(2);
    expect(JSON.stringify(ctx.store.get(ORG_A, first.id))).toBe(before);
  });
});

describe('delayed and duplicate external events', () => {
  it('ignores a duplicate and a stale event after acceptance', async () => {
    const ctx = setup();
    const attempt = await prepared(ctx, 'a0000012-0000-4000-8000-000000000000');
    await ctx.coordinator.originate({
      organizationId: ORG_A,
      attemptId: attempt.id,
      destination: DESTINATION,
    });
    const event = {
      eventId: 'b0000002-0000-4000-8000-000000000000',
      organizationId: ORG_A,
      attemptId: attempt.id,
      jobId: JOB,
      occurredAt: '2026-10-19T12:00:01.000Z',
      type: 'CALL_CLOSED_CONFIRMED',
    };
    const input = { organizationId: ORG_A, attemptId: attempt.id, event };
    expect((await ctx.coordinator.applyEvent(input)).kind).toBe('APPLIED');
    expect((await ctx.coordinator.applyEvent(input)).kind).toBe('DUPLICATE');
    const late = {
      ...event,
      eventId: 'b0000003-0000-4000-8000-000000000000',
      type: 'ORIGINATION_RESULT_UNKNOWN',
      reasonCode: 'TIMEOUT',
    };
    expect((await ctx.coordinator.applyEvent({ ...input, event: late })).kind).toBe('STALE');
    expect(ctx.store.get(ORG_A, attempt.id)?.state).toBe('CLOSED');
  });
});
