import type {
  OutboundCallBootstrapOutcome,
  OutboundCallBootstrapPort,
  OutboundCallJob,
  OutboundCallJobStatus,
  OutboundRepositoryPort,
} from '@voice-agent/contracts';
import {
  calculateNextRetryAt,
  isRetryEligible,
  type OutboundRetryPolicyConfig,
} from './outbound-retry-policy.js';

export interface OutboundDispatchResult {
  readonly jobId: string;
  readonly status: OutboundCallJobStatus;
  readonly callId?: string | undefined;
  readonly error?: string | undefined;
  readonly nextRetryAt?: Date | undefined;
}

export interface OutboundDispatcherOptions {
  readonly repository: OutboundRepositoryPort;
  readonly bootstrapPort: OutboundCallBootstrapPort;
  readonly workerId: string;
  readonly retryConfig?: Partial<OutboundRetryPolicyConfig> | undefined;
}

export class OutboundCallDispatcher {
  private readonly repo: OutboundRepositoryPort;
  private readonly bootstrapPort: OutboundCallBootstrapPort;
  private readonly workerId: string;
  private readonly retryConfig?: Partial<OutboundRetryPolicyConfig> | undefined;

  constructor(options: OutboundDispatcherOptions) {
    this.repo = options.repository;
    this.bootstrapPort = options.bootstrapPort;
    this.workerId = options.workerId;
    this.retryConfig = options.retryConfig;
  }

  async dispatchNextDueJob(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<OutboundDispatchResult | null> {
    const job = await this.repo.claimNextDueJob({
      organizationId,
      workerId: this.workerId,
      now,
    });
    if (!job) return null;
    return this.processClaimedJob(job, now);
  }

  async dispatchJob(
    organizationId: string,
    jobId: string,
    now: Date = new Date(),
  ): Promise<OutboundDispatchResult | null> {
    const job = await this.repo.claimJob({
      organizationId,
      jobId,
      workerId: this.workerId,
      now,
    });
    if (!job) return null;
    return this.processClaimedJob(job, now);
  }

  private async processClaimedJob(
    job: OutboundCallJob,
    now: Date,
  ): Promise<OutboundDispatchResult> {
    const idempotencyKey = `${job.idempotencyKey}-att-${job.attempts}`;

    try {
      const outcome = await this.bootstrapPort.bootstrapOutboundCall({
        organizationId: job.organizationId,
        outboundJobId: job.id,
        agentId: job.agentId,
        agentVersionId: job.agentVersionId,
        destinationPhone: job.destinationPhone,
        idempotencyKey,
      });

      return await this.handleOutcome(job, outcome, now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return await this.handleRetryableFailure(job, msg, now);
    }
  }

  private async handleOutcome(
    job: OutboundCallJob,
    outcome: OutboundCallBootstrapOutcome,
    now: Date,
  ): Promise<OutboundDispatchResult> {
    if (outcome.kind === 'ACCEPTED') {
      await this.repo.updateJobOutcome({
        organizationId: job.organizationId,
        jobId: job.id,
        status: 'DISPATCHED',
        callId: outcome.callId,
        lastAttemptAt: now,
      });
      return { jobId: job.id, status: 'DISPATCHED', callId: outcome.callId };
    }

    if (outcome.kind === 'TERMINAL_FAILURE') {
      const error = outcome.reason;
      await this.repo.updateJobOutcome({
        organizationId: job.organizationId,
        jobId: job.id,
        status: 'FAILED_TERMINAL',
        lastError: error,
        lastAttemptAt: now,
      });
      return { jobId: job.id, status: 'FAILED_TERMINAL', error };
    }

    return this.handleRetryableFailure(job, outcome.reason, now);
  }

  private async handleRetryableFailure(
    job: OutboundCallJob,
    errorMessage: string | undefined,
    now: Date,
  ): Promise<OutboundDispatchResult> {
    const error = errorMessage || 'Retryable failure reported by bootstrap';

    if (isRetryEligible(job.attempts, job.maxAttempts)) {
      const nextRetryAt = calculateNextRetryAt(job.attempts, now, this.retryConfig);
      await this.repo.updateJobOutcome({
        organizationId: job.organizationId,
        jobId: job.id,
        status: 'FAILED_RETRYABLE',
        lastError: error,
        nextRetryAt,
        lastAttemptAt: now,
      });
      return { jobId: job.id, status: 'FAILED_RETRYABLE', error, nextRetryAt };
    }

    const terminalError = `${error} (exhausted max attempts: ${job.maxAttempts})`;
    await this.repo.updateJobOutcome({
      organizationId: job.organizationId,
      jobId: job.id,
      status: 'FAILED_TERMINAL',
      lastError: terminalError,
      lastAttemptAt: now,
    });
    return { jobId: job.id, status: 'FAILED_TERMINAL', error: terminalError };
  }
}
