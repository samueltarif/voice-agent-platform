import { and, eq } from 'drizzle-orm';
import {
  applyOutboundAttemptEvent,
  outboundAttemptEventSchema,
  type OutboundAttemptEvent,
  type OutboundAttemptRejectionReason,
} from '@voice-agent/contracts';
import { callAttempts, type CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { attemptStateColumns, type DurableAttemptRecord } from './call-attempt-mapping.js';
import { insertAttemptEvent } from './call-event-store.js';
import {
  classifyKnownEvent,
  fenceViolated,
  loadRecord,
  lockAttemptRow,
  type AttemptFence,
} from './durable-attempt-row-access.js';

export { lockAttemptRow, type AttemptFence };

export type AttemptTechnicalPatch = Partial<
  Pick<
    CallAttemptEntity,
    'claimOwner' | 'fencingToken' | 'leaseExpiresAt' | 'sendStartedAt' | 'lastReconciliationAt'
  >
>;

export interface ApplyAttemptEventInput {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly event: unknown;
  readonly now: Date;
  readonly expectedStateVersion?: number | undefined;
  readonly fence?: AttemptFence | undefined;
  /** Colunas técnicas gravadas na MESMA transação quando o evento é aplicado. */
  readonly patch?: AttemptTechnicalPatch | undefined;
  /** Grava `patch` também quando o evento é STALE (ex.: retomada de claim expirado). */
  readonly patchOnStale?: boolean | undefined;
}

export type DurableApplyOutcome =
  | { readonly kind: 'APPLIED' | 'DUPLICATE' | 'STALE'; readonly record: DurableAttemptRecord }
  | {
      readonly kind: 'REJECTED';
      readonly record: DurableAttemptRecord;
      readonly reason: OutboundAttemptRejectionReason;
    }
  | { readonly kind: 'VERSION_CONFLICT' | 'FENCED'; readonly record: DurableAttemptRecord }
  | { readonly kind: 'NOT_FOUND' | 'EVENT_ID_CONFLICT' };

/** Rejeições de escopo nunca são gravadas na trilha do tenant local. */
const UNRECORDED_REASONS: ReadonlySet<OutboundAttemptRejectionReason> = new Set([
  'INVALID_EVENT',
  'TENANT_MISMATCH',
  'ATTEMPT_MISMATCH',
  'JOB_MISMATCH',
  'SESSION_MISMATCH',
]);

async function persistApplied(
  executor: DatabaseExecutor,
  ctx: {
    readonly row: CallAttemptEntity;
    readonly next: DurableAttemptRecord['attempt'] | null;
    readonly input: ApplyAttemptEventInput;
  },
): Promise<CallAttemptEntity> {
  const { row, next, input } = ctx;
  const [updated] = await executor
    .update(callAttempts)
    .set({
      ...(next ? attemptStateColumns(next) : {}),
      ...input.patch,
      stateVersion: row.stateVersion + 1,
      updatedAt: input.now,
    })
    .where(and(eq(callAttempts.id, row.id), eq(callAttempts.stateVersion, row.stateVersion)))
    .returning();
  if (!updated) throw new Error('Attempt CAS update lost under row lock.');
  return updated;
}

async function persistIfNeeded(
  executor: DatabaseExecutor,
  ctx: {
    readonly row: CallAttemptEntity;
    readonly result: ReturnType<typeof applyOutboundAttemptEvent>;
    readonly input: ApplyAttemptEventInput;
  },
): Promise<CallAttemptEntity> {
  const { row, result, input } = ctx;
  if (result.kind === 'APPLIED')
    return persistApplied(executor, { row, next: result.attempt, input });
  if (result.kind === 'STALE' && input.patchOnStale && input.patch) {
    return persistApplied(executor, { row, next: null, input });
  }
  return row;
}

/**
 * Transação equivalente a: lock → fence/versão → identidade do evento →
 * FSM canônica → mutação + trilha de auditoria. Deve rodar DENTRO de uma
 * transação: estado e trilha nunca divergem.
 */
export async function applyAttemptEventInTransaction(
  executor: DatabaseExecutor,
  input: ApplyAttemptEventInput,
): Promise<DurableApplyOutcome> {
  const row = await lockAttemptRow(executor, input);
  if (!row) return { kind: 'NOT_FOUND' };
  const record = await loadRecord(executor, row);
  if (fenceViolated(row, input.fence)) return { kind: 'FENCED', record };
  const versionMismatch =
    input.expectedStateVersion !== undefined && input.expectedStateVersion !== row.stateVersion;
  if (versionMismatch) return { kind: 'VERSION_CONFLICT', record };
  const parsed = outboundAttemptEventSchema.safeParse(input.event);
  if (!parsed.success) return { kind: 'REJECTED', record, reason: 'INVALID_EVENT' };
  const known = await classifyKnownEvent(executor, row, parsed.data);
  if (known === 'EVENT_ID_CONFLICT') return { kind: 'EVENT_ID_CONFLICT' };
  if (known === 'DUPLICATE') return { kind: 'DUPLICATE', record };
  return applyNewEvent(executor, { row, record, event: parsed.data, input });
}

async function applyNewEvent(
  executor: DatabaseExecutor,
  ctx: {
    readonly row: CallAttemptEntity;
    readonly record: DurableAttemptRecord;
    readonly event: OutboundAttemptEvent;
    readonly input: ApplyAttemptEventInput;
  },
): Promise<DurableApplyOutcome> {
  const { row, record, event, input } = ctx;
  const result = applyOutboundAttemptEvent(record.attempt, event);
  if (result.kind === 'DUPLICATE') return { kind: 'DUPLICATE', record };
  if (result.kind === 'REJECTED' && UNRECORDED_REASONS.has(result.reason)) {
    return { kind: 'REJECTED', record, reason: result.reason };
  }
  const finalRow = await persistIfNeeded(executor, { row, result, input });
  await insertAttemptEvent(executor, {
    organizationId: row.organizationId,
    attemptId: row.id,
    callSessionId: finalRow.callSessionId,
    event,
    result: result.kind,
    rejectionReason: result.kind === 'REJECTED' ? result.reason : null,
    now: input.now,
  });
  const next = await loadRecord(executor, finalRow);
  if (result.kind === 'REJECTED') return { kind: 'REJECTED', record: next, reason: result.reason };
  return { kind: result.kind, record: next };
}
