import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { PendingBookingIntent, PostCallReport } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { BookingIntentEntity } from '../schema/booking-intents.js';
import { callSessions } from '../schema/call-sessions.js';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { outboundCallJobs } from '../schema/outbound.js';
import { lockPendingIntent } from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  ensureReconciliation,
  lockReconciliation,
  updateReconciliation,
} from './post-call-reconciliation-store.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';
import { calendarTimezone } from './scheduling-agent-scope.js';

/**
 * E2 simplificada (DEC-077) — 1ª etapa do relatório pós-chamada (trava R):
 * valida a sessão da tentativa resolvida PELO SERVIDOR (nunca pelo
 * relatório), registra o digest (idempotência) e carrega a intenção
 * pendente. Mesmo digest com reconciliação concluída = duplicado (sem
 * efeito); digest diferente = conflito (revisão humana, sem efeito); mesmo
 * digest ainda pendente = reprocessamento idempotente (entrega repetida
 * depois de falha).
 */

export interface PostCallAttempt {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly callSessionId: string | null;
  readonly agentId: string;
  readonly agentVersionId: string;
}

export type RecordStep =
  | {
      readonly kind: 'STOP';
      readonly status: 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW';
      readonly reason: string;
    }
  | {
      readonly kind: 'PROCESS';
      readonly organizationId: string;
      readonly sessionId: string;
      readonly phoneE164: string;
      readonly leadId: string | null;
      readonly intent: BookingIntentEntity | null;
      readonly pending: PendingBookingIntent | null;
      readonly optOutByTool: boolean;
      readonly proposedOutcome: string | null;
    };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const reportDigest = (report: PostCallReport) =>
  createHash('sha256').update(stableJson(report)).digest('hex');

type SessionPhone =
  | { readonly phone: string; readonly reason: null }
  | { readonly phone: null; readonly reason: 'SESSION_NOT_FOUND' | 'SESSION_ATTEMPT_MISMATCH' };

async function sessionPhone(
  tx: DatabaseExecutor,
  attempt: PostCallAttempt,
  sessionId: string,
): Promise<SessionPhone> {
  const [session] = await tx
    .select({ attemptId: callSessions.currentAttemptId })
    .from(callSessions)
    .where(
      and(eq(callSessions.id, sessionId), eq(callSessions.organizationId, attempt.organizationId)),
    );
  const [job] = await tx
    .select({ phone: outboundCallJobs.destinationPhone })
    .from(outboundCallJobs)
    .where(
      and(
        eq(outboundCallJobs.id, attempt.jobId),
        eq(outboundCallJobs.organizationId, attempt.organizationId),
      ),
    );
  if (!session || !job?.phone) return { phone: null, reason: 'SESSION_NOT_FOUND' };
  // A sessão tem de estar vinculada a ESTA tentativa (o par vem do servidor, mas é revalidado).
  if (session.attemptId !== attempt.attemptId) {
    return { phone: null, reason: 'SESSION_ATTEMPT_MISMATCH' };
  }
  return { phone: job.phone, reason: null };
}

async function pendingOf(tx: DatabaseExecutor, intent: BookingIntentEntity | null) {
  if (!intent) return null;
  const [offer] = await tx
    .select({ startsAt: meetingSlotOffers.startsAt, calendarId: meetingSlotOffers.calendarId })
    .from(meetingSlotOffers)
    .where(
      and(
        eq(meetingSlotOffers.id, intent.offerId),
        eq(meetingSlotOffers.organizationId, intent.organizationId),
      ),
    );
  const timeZone = offer
    ? await calendarTimezone(tx, {
        organizationId: intent.organizationId,
        calendarId: offer.calendarId,
      })
    : null;
  if (!offer || !timeZone) return null;
  const startsAt = offer.startsAt.toISOString();
  return { listRevision: intent.listRevision, option: intent.option, startsAt, timeZone };
}

const stop = (status: 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW', reason: string): RecordStep => ({
  kind: 'STOP',
  status,
  reason,
});

export function recordReport(
  db: DatabaseInstance,
  input: { readonly attempt: PostCallAttempt; readonly report: PostCallReport; readonly now: Date },
): Promise<RecordStep> {
  const { attempt } = input;
  const sessionId = attempt.callSessionId;
  if (!sessionId) return Promise.resolve(stop('REJECTED', 'NO_SESSION'));
  return db.transaction(async (tx): Promise<RecordStep> => {
    const resolved = await sessionPhone(tx, attempt, sessionId);
    if (resolved.phone === null) return stop('REJECTED', resolved.reason);
    const phoneE164 = resolved.phone;
    const leadId = await leadIdForPhone(tx, { organizationId: attempt.organizationId, phoneE164 });
    const binding = { ...attempt, sessionId };
    const key = { organizationId: attempt.organizationId, sessionId };
    const intent = await lockPendingIntent(tx, key);
    await ensureReconciliation(tx, binding, { phoneE164, leadId, now: input.now });
    const row = (await lockReconciliation(tx, key))!;
    if (row.attemptId !== attempt.attemptId) return stop('REJECTED', 'ATTEMPT_MISMATCH');
    const digest = reportDigest(input.report);
    if (row.reportDigest && row.reportDigest !== digest) {
      const reviewReasons = [...new Set([...row.reviewReasons, 'REPORT_CONFLICT'])];
      await updateReconciliation(tx, key, {
        status: 'NEEDS_REVIEW',
        reviewReasons,
        reconciledAt: null,
      });
      return stop('NEEDS_REVIEW', 'REPORT_CONFLICT');
    }
    if (row.reportDigest && row.status !== 'AWAITING_REPORT') return stop('DUPLICATE', row.status);
    await updateReconciliation(tx, key, {
      reportDigest: digest,
      reportReceivedAt: input.now,
      reportEndReason: input.report.endReason,
    });
    const pending = await pendingOf(tx, intent);
    const optOutByTool = row.optOutToolAt !== null;
    return {
      kind: 'PROCESS',
      organizationId: attempt.organizationId,
      sessionId,
      phoneE164,
      leadId,
      intent,
      pending,
      optOutByTool,
      proposedOutcome: row.proposedOutcome,
    };
  });
}
