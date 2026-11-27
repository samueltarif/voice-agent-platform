import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { PostCallReport } from '@voice-agent/contracts';
import type { BookingIntentEntity } from '../schema/booking-intents.js';
import { callSessions } from '../schema/call-sessions.js';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { PostCallAttempt } from './post-call-record.js';
import { calendarTimezone } from './scheduling-agent-scope.js';

/** DEC-077 — apoio do registro do relatório: digest, telefone da sessão e oferta da intenção. */

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

export async function sessionPhone(
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

export async function pendingOf(tx: DatabaseExecutor, intent: BookingIntentEntity | null) {
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
