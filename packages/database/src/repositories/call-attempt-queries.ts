import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { callAttempts } from '../schema/call-attempts.js';
import { toDurableAttemptRecord, type DurableAttemptRecord } from './call-attempt-mapping.js';
import { listAppliedAttemptEventIds } from './call-event-store.js';

const MAX_LIST_LIMIT = 100;

/** Leituras tenant-scoped das tentativas (sem efeitos). */
export class DrizzleCallAttemptQueries {
  constructor(protected readonly db: DatabaseInstance) {}

  async getById(scope: {
    readonly organizationId: string;
    readonly attemptId: string;
  }): Promise<DurableAttemptRecord | null> {
    const [row] = await this.db
      .select()
      .from(callAttempts)
      .where(
        and(
          eq(callAttempts.id, scope.attemptId),
          eq(callAttempts.organizationId, scope.organizationId),
        ),
      );
    if (!row) return null;
    return toDurableAttemptRecord(row, await listAppliedAttemptEventIds(this.db, scope));
  }

  async listByJob(scope: { readonly organizationId: string; readonly jobId: string }) {
    const rows = await this.db
      .select()
      .from(callAttempts)
      .where(
        and(
          eq(callAttempts.organizationId, scope.organizationId),
          eq(callAttempts.jobId, scope.jobId),
        ),
      )
      .orderBy(asc(callAttempts.attemptNumber))
      .limit(MAX_LIST_LIMIT);
    return rows.map((row) => toDurableAttemptRecord(row, []));
  }

  /** Candidatas à reconciliação: desfecho incerto sem revisão manual pendente. */
  async listReconciliationCandidates(input: {
    readonly organizationId: string;
    readonly now: Date;
    readonly limit: number;
  }) {
    const reclaimable = and(
      eq(callAttempts.state, 'RECONCILIATION_PENDING'),
      or(isNull(callAttempts.leaseExpiresAt), lte(callAttempts.leaseExpiresAt, input.now)),
    );
    const rows = await this.db
      .select({ id: callAttempts.id, state: callAttempts.state })
      .from(callAttempts)
      .where(
        and(
          eq(callAttempts.organizationId, input.organizationId),
          eq(callAttempts.requiresManualReview, false),
          or(eq(callAttempts.state, 'OUTCOME_UNKNOWN'), reclaimable),
        ),
      )
      .orderBy(asc(callAttempts.id))
      .limit(Math.min(input.limit, MAX_LIST_LIMIT));
    return rows;
  }
}
