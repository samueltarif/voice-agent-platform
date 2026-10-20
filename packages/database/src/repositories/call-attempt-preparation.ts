import { and, eq } from 'drizzle-orm';
import {
  createOutboundAttempt,
  evaluateSuccessorAttempt,
  type SuccessorAttemptBlockReason,
} from '@voice-agent/contracts';
import { callAttempts } from '../schema/call-attempts.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import { toOutboundAttempt, type DurableAttemptRecord } from './call-attempt-mapping.js';
import { applyAttemptEventInTransaction } from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';

export interface PrepareDurableAttemptInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly correlationId: string;
  readonly intentEventId: string;
  readonly now: Date;
}

export type PrepareDurableAttemptBlockReason =
  | SuccessorAttemptBlockReason
  | 'JOB_NOT_FOUND'
  | 'CONCURRENT_ATTEMPT_CONFLICT'
  | 'REFERENCE_REJECTED';

export type PrepareDurableAttemptResult =
  | { readonly kind: 'PREPARED'; readonly record: DurableAttemptRecord }
  | { readonly kind: 'BLOCKED'; readonly reason: PrepareDurableAttemptBlockReason };

/** O job é resolvido no servidor (tenant, agente, chave, maxAttempts) e travado. */
async function lockJob(executor: DatabaseExecutor, input: PrepareDurableAttemptInput) {
  const [job] = await executor
    .select()
    .from(outboundCallJobs)
    .where(
      and(
        eq(outboundCallJobs.id, input.jobId),
        eq(outboundCallJobs.organizationId, input.organizationId),
      ),
    )
    .for('update');
  return job ?? null;
}

async function attemptIdTaken(executor: DatabaseExecutor, attemptId: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: callAttempts.id })
    .from(callAttempts)
    .where(eq(callAttempts.id, attemptId))
    .limit(1);
  return row !== undefined;
}

/**
 * Prepara a sucessora com serialização transacional por job (FOR UPDATE no
 * job). Inserção + INTENT_RECORDED na MESMA transação: uma queda no meio não
 * deixa tentativa CREATED órfã. O índice parcial de "uma tentativa aberta por
 * job" é a última linha de defesa no banco.
 */
export async function prepareAttemptInTransaction(
  executor: DatabaseExecutor,
  input: PrepareDurableAttemptInput,
): Promise<PrepareDurableAttemptResult> {
  const job = await lockJob(executor, input);
  if (!job) return { kind: 'BLOCKED', reason: 'JOB_NOT_FOUND' };
  if (await attemptIdTaken(executor, input.attemptId)) {
    return { kind: 'BLOCKED', reason: 'ATTEMPT_ID_ALREADY_EXISTS' };
  }
  const historyRows = await executor
    .select()
    .from(callAttempts)
    .where(
      and(eq(callAttempts.organizationId, job.organizationId), eq(callAttempts.jobId, job.id)),
    );
  const history = historyRows.map((row) => toOutboundAttempt(row, []));
  const decision = evaluateSuccessorAttempt(history, {
    organizationId: job.organizationId,
    jobId: job.id,
    maxAttempts: job.maxAttempts,
    attemptId: input.attemptId,
  });
  if (!decision.allowed) return { kind: 'BLOCKED', reason: decision.reason };
  const attempt = createOutboundAttempt({
    id: input.attemptId,
    organizationId: job.organizationId,
    jobId: job.id,
    campaignId: job.campaignId ?? null,
    attemptNumber: decision.nextAttemptNumber,
    correlationId: input.correlationId,
    agentId: job.agentId,
    agentVersionId: job.agentVersionId,
    jobIdempotencyKey: job.idempotencyKey,
    createdAt: input.now.toISOString(),
  });
  await executor.insert(callAttempts).values({
    ...attempt,
    createdAt: input.now,
    updatedAt: input.now,
    lastEventAt: null,
  });
  return recordIntent(executor, { attempt, input });
}

async function recordIntent(
  executor: DatabaseExecutor,
  ctx: {
    readonly attempt: ReturnType<typeof createOutboundAttempt>;
    readonly input: PrepareDurableAttemptInput;
  },
): Promise<PrepareDurableAttemptResult> {
  const event = buildInternalAttemptEvent({
    attempt: ctx.attempt,
    type: 'INTENT_RECORDED',
    eventId: ctx.input.intentEventId,
    now: ctx.input.now,
  });
  const outcome = await applyAttemptEventInTransaction(executor, {
    organizationId: ctx.attempt.organizationId,
    attemptId: ctx.attempt.id,
    event,
    now: ctx.input.now,
  });
  if (outcome.kind !== 'APPLIED') {
    throw new Error(`Attempt intent could not be recorded (${outcome.kind}).`);
  }
  return { kind: 'PREPARED', record: outcome.record };
}
