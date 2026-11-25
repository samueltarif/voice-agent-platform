import { and, eq, sql } from 'drizzle-orm';
import { leadStatusAfterCancellation } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { meetings, type MeetingEntity } from '../schema/meetings.js';
import { isLeadPhoneSuppressed } from './attempt-lead-association.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyLeadStatusChange, lockLead } from './lead-status-writer.js';
import { insertSchedulingAudit, type SchedulingActor } from './scheduling-audit-entry.js';

export type CancelMeetingOutcome =
  | { readonly kind: 'CANCELED' | 'ALREADY_CANCELED'; readonly meeting: MeetingEntity }
  | { readonly kind: 'NOT_FOUND' | 'VERSION_CONFLICT' };

export interface CancelMeetingInput {
  readonly organizationId: string;
  readonly meetingId: string;
  readonly expectedVersion: number;
  readonly actor: SchedulingActor;
  readonly reason?: string | undefined;
  readonly now: Date;
}

async function findMeeting(executor: DatabaseExecutor, input: CancelMeetingInput, lock: boolean) {
  const query = executor
    .select()
    .from(meetings)
    .where(
      and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)),
    );
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

/**
 * E1 (DEC-074) — cancelamento idempotente: libera o horário (a exclusão e os
 * índices únicos só valem para reuniões `SCHEDULED`) e devolve o lead a
 * `QUALIFIED` — ou a `DO_NOT_CALL` se o telefone estiver suprimido (o
 * cancelamento nunca reabilita ligações). Travas: lead → reunião.
 */
export class DrizzleMeetingCancellationService {
  constructor(private readonly db: DatabaseInstance) {}

  cancelMeeting(input: CancelMeetingInput): Promise<CancelMeetingOutcome> {
    return this.db.transaction(async (tx) => {
      const preview = await findMeeting(tx, input, false);
      if (!preview) return { kind: 'NOT_FOUND' as const };
      const lead = await lockLead(tx, input.organizationId, preview.leadId);
      const meeting = await findMeeting(tx, input, true);
      if (!meeting || !lead) return { kind: 'NOT_FOUND' as const };
      if (meeting.status === 'CANCELED') return { kind: 'ALREADY_CANCELED' as const, meeting };
      if (meeting.version !== input.expectedVersion) return { kind: 'VERSION_CONFLICT' as const };
      const [canceled] = await tx
        .update(meetings)
        .set({
          status: 'CANCELED',
          version: sql`${meetings.version} + 1`,
          canceledAt: input.now,
          canceledByType: input.actor.type,
          canceledById: input.actor.id,
          cancelReason: input.reason ?? null,
          updatedAt: input.now,
        })
        .where(eq(meetings.id, meeting.id))
        .returning();
      if (lead.status === 'MEETING_SCHEDULED') {
        const suppressed = await isLeadPhoneSuppressed(tx, input.organizationId, lead.id);
        await applyLeadStatusChange(tx, {
          lead,
          to: leadStatusAfterCancellation(suppressed),
          origin: 'MEETING_CANCELED',
          actor: input.actor,
          meetingId: meeting.id,
        });
      }
      await insertSchedulingAudit(tx, {
        organizationId: input.organizationId,
        actor: input.actor,
        action: 'meeting.canceled',
        targetType: 'meeting',
        targetId: meeting.id,
        metadata: { calendarId: meeting.calendarId, leadId: meeting.leadId },
      });
      return { kind: 'CANCELED' as const, meeting: canceled! };
    });
  }
}
