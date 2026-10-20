import { and, eq } from 'drizzle-orm';
import type { OutboundAttemptEvent } from '@voice-agent/contracts';
import { callAttempts, type CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { toDurableAttemptRecord } from './call-attempt-mapping.js';
import {
  findEventIdentity,
  fingerprintAttemptEvent,
  listAppliedAttemptEventIds,
} from './call-event-store.js';

export interface AttemptFence {
  readonly ownerId: string;
  readonly fencingToken: number;
}

export async function lockAttemptRow(
  executor: DatabaseExecutor,
  scope: { readonly organizationId: string; readonly attemptId: string },
): Promise<CallAttemptEntity | null> {
  const [row] = await executor
    .select()
    .from(callAttempts)
    .where(
      and(
        eq(callAttempts.id, scope.attemptId),
        eq(callAttempts.organizationId, scope.organizationId),
      ),
    )
    .for('update');
  return row ?? null;
}

export async function loadRecord(executor: DatabaseExecutor, row: CallAttemptEntity) {
  const ids = await listAppliedAttemptEventIds(executor, {
    organizationId: row.organizationId,
    attemptId: row.id,
  });
  return toDurableAttemptRecord(row, ids);
}

export function fenceViolated(row: CallAttemptEntity, fence: AttemptFence | undefined): boolean {
  if (!fence) return false;
  return row.claimOwner !== fence.ownerId || row.fencingToken !== fence.fencingToken;
}

export async function classifyKnownEvent(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
  event: OutboundAttemptEvent,
): Promise<'NEW' | 'DUPLICATE' | 'EVENT_ID_CONFLICT'> {
  const known = await findEventIdentity(executor, event.eventId);
  if (!known) return 'NEW';
  const same =
    known.organizationId === row.organizationId &&
    known.attemptId === row.id &&
    known.fingerprint === fingerprintAttemptEvent(event);
  return same ? 'DUPLICATE' : 'EVENT_ID_CONFLICT';
}
