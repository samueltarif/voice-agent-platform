import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOutboundRepository } from './in-memory-outbound-repository.js';
import { InMemoryOutboundBootstrapPort } from './in-memory-outbound-bootstrap-port.js';
import { OutboundCallDispatcher } from './outbound-call-dispatcher.js';

describe('OutboundCallDispatcher (007E Offline Worker)', () => {
  let repo: InMemoryOutboundRepository;
  let bootstrapPort: InMemoryOutboundBootstrapPort;
  let dispatcher: OutboundCallDispatcher;

  const tenantA = 'org-tenant-a';
  const tenantB = 'org-tenant-b';
  const agentId = 'agent-101';
  const agentVersionId = 'agent-ver-202';
  const workerId = 'worker-node-1';

  beforeEach(() => {
    repo = new InMemoryOutboundRepository();
    bootstrapPort = new InMemoryOutboundBootstrapPort();
    dispatcher = new OutboundCallDispatcher({
      repository: repo,
      bootstrapPort,
      workerId,
      retryConfig: {
        maxAttempts: 3,
        initialBackoffMs: 10_000,
        backoffMultiplier: 2,
        maxBackoffMs: 60_000,
      },
    });
  });

  it('claims due job and dispatches through provider-neutral port with trusted context', async () => {
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990001',
      recipientName: 'Alice',
      idempotencyKey: 'idemp-1',
      scheduledAt: new Date(Date.now() - 5000),
    });

    bootstrapPort.setDefaultOutcome({ kind: 'ACCEPTED', callId: 'call-uuid-999' });

    const result = await dispatcher.dispatchNextDueJob(tenantA);

    expect(result).not.toBeNull();
    expect(result?.status).toBe('DISPATCHED');
    expect(result?.callId).toBe('call-uuid-999');

    // Verify bootstrap port received trusted context
    expect(bootstrapPort.invocations).toHaveLength(1);
    const invocation = bootstrapPort.invocations[0]!;
    expect(invocation.organizationId).toBe(tenantA);
    expect(invocation.agentId).toBe(agentId);
    expect(invocation.agentVersionId).toBe(agentVersionId);
    expect(invocation.destinationPhone).toBe('+5511999990001');
    expect(invocation.outboundJobId).toBe(job.id);
    expect(invocation.idempotencyKey).toBe('idemp-1-att-1');

    // Verify job in repository
    const updated = await repo.getJobById(tenantA, job.id);
    expect(updated?.status).toBe('DISPATCHED');
    expect(updated?.callId).toBe('call-uuid-999');
    expect(updated?.attempts).toBe(1);
  });

  it('does not claim future scheduled jobs', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990002',
      idempotencyKey: 'idemp-future',
      scheduledAt: futureDate,
    });

    const result = await dispatcher.dispatchNextDueJob(tenantA);
    expect(result).toBeNull();
    expect(bootstrapPort.invocations).toHaveLength(0);
  });

  it('prevents cross-tenant job claiming', async () => {
    await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990003',
      idempotencyKey: 'idemp-tenant-a',
      scheduledAt: new Date(Date.now() - 1000),
    });

    // Tenant B cannot claim tenant A's job
    const resultB = await dispatcher.dispatchNextDueJob(tenantB);
    expect(resultB).toBeNull();
    expect(bootstrapPort.invocations).toHaveLength(0);
  });

  it('prevents two workers from claiming the same job concurrently', async () => {
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990004',
      idempotencyKey: 'idemp-concurrent',
      scheduledAt: new Date(Date.now() - 1000),
    });

    const worker2 = new OutboundCallDispatcher({
      repository: repo,
      bootstrapPort,
      workerId: 'worker-node-2',
    });

    // Worker 1 claims job
    const claim1 = await dispatcher.dispatchJob(tenantA, job.id);
    expect(claim1?.status).toBe('DISPATCHED');

    // Worker 2 attempts same job
    const claim2 = await worker2.dispatchJob(tenantA, job.id);
    expect(claim2).toBeNull();
    expect(bootstrapPort.invocations).toHaveLength(1);
  });

  it('handles retryable failure with exponential backoff', async () => {
    const baseTime = new Date('2026-10-08T15:00:00Z');
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990005',
      idempotencyKey: 'idemp-retryable',
      scheduledAt: new Date(baseTime.getTime() - 10_000),
    });

    bootstrapPort.setDefaultOutcome({
      kind: 'RETRYABLE_FAILURE',
      reason: 'Network timeout',
    });

    const result = await dispatcher.dispatchJob(tenantA, job.id, baseTime);

    expect(result?.status).toBe('FAILED_RETRYABLE');
    expect(result?.error).toBe('Network timeout');
    expect(result?.nextRetryAt).toEqual(new Date(baseTime.getTime() + 10_000)); // initial 10s backoff

    const updated = await repo.getJobById(tenantA, job.id);
    expect(updated?.status).toBe('FAILED_RETRYABLE');
    expect(updated?.attempts).toBe(1);
    expect(updated?.nextRetryAt).toEqual(new Date(baseTime.getTime() + 10_000));
  });

  it('transitions to FAILED_TERMINAL when max attempts are exceeded', async () => {
    const baseTime = new Date('2026-10-08T15:00:00Z');
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990006',
      idempotencyKey: 'idemp-max-attempts',
      scheduledAt: new Date(baseTime.getTime() - 10_000),
      maxAttempts: 2,
    });

    bootstrapPort.setDefaultOutcome({
      kind: 'RETRYABLE_FAILURE',
      reason: 'Carrier temporary unavailable',
    });

    // Attempt 1 -> FAILED_RETRYABLE
    const res1 = await dispatcher.dispatchJob(tenantA, job.id, baseTime);
    expect(res1?.status).toBe('FAILED_RETRYABLE');

    // Fast-forward to retry time (past baseTime + 10s)
    const retryTime = new Date(baseTime.getTime() + 15_000);
    const res2 = await dispatcher.dispatchJob(tenantA, job.id, retryTime);
    expect(res2?.status).toBe('FAILED_TERMINAL');
    expect(res2?.error).toContain('exhausted max attempts: 2');

    const updated = await repo.getJobById(tenantA, job.id);
    expect(updated?.status).toBe('FAILED_TERMINAL');
    expect(updated?.attempts).toBe(2);
  });

  it('transitions directly to FAILED_TERMINAL on terminal failure', async () => {
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990007',
      idempotencyKey: 'idemp-term',
      scheduledAt: new Date(Date.now() - 1000),
    });

    bootstrapPort.setDefaultOutcome({
      kind: 'TERMINAL_FAILURE',
      reason: 'Invalid phone number format',
    });

    const result = await dispatcher.dispatchJob(tenantA, job.id);
    expect(result?.status).toBe('FAILED_TERMINAL');
    expect(result?.error).toBe('Invalid phone number format');

    const updated = await repo.getJobById(tenantA, job.id);
    expect(updated?.status).toBe('FAILED_TERMINAL');
    expect(updated?.attempts).toBe(1);
    expect(updated?.nextRetryAt).toBeUndefined();
  });

  it('preserves idempotency across duplicate attempt keys', async () => {
    const job = await repo.createJob({
      organizationId: tenantA,
      agentId,
      agentVersionId,
      destinationPhone: '+5511999990008',
      idempotencyKey: 'idemp-stable',
      scheduledAt: new Date(Date.now() - 1000),
    });

    bootstrapPort.setDefaultOutcome({ kind: 'ACCEPTED', callId: 'call-1' });
    await dispatcher.dispatchJob(tenantA, job.id);

    expect(bootstrapPort.invocations[0]?.idempotencyKey).toBe('idemp-stable-att-1');
  });
});
