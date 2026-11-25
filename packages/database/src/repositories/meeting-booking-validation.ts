import {
  evaluateLeadStatusChange,
  evaluateSlotBookability,
  type TimeInterval,
} from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import type { MeetingEntity } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyLeadStatusChange } from './lead-status-writer.js';
import type { BookMeetingOutcome, MeetingBookingRequest } from './meeting-booking-steps.js';
import { insertSchedulingAudit } from './scheduling-audit-entry.js';
import {
  findCalendarRow,
  loadBusyIntervals,
  loadCalendarSnapshot,
} from './scheduling-calendar-snapshot.js';

const DAY_MS = 86_400_000;

/** E1 (DEC-074) — validação autoritativa e registro de uma reserva, dentro da transação. */

export type BookingTargets =
  | { readonly ok: false; readonly outcome: BookMeetingOutcome }
  | {
      readonly ok: true;
      readonly lead: LeadEntity;
      readonly slot: TimeInterval;
      readonly calendarId: string;
    };

/** Trava a agenda e revalida status do lead e horário (sem escrever). */
export async function resolveBookingTargets(
  tx: DatabaseExecutor,
  request: MeetingBookingRequest,
  lead: LeadEntity,
): Promise<BookingTargets> {
  const row = await findCalendarRow(tx, { ...request, lock: true });
  if (!row) return { ok: false, outcome: { kind: 'CALENDAR_NOT_FOUND' } };
  if (lead.status === 'MEETING_SCHEDULED')
    return { ok: false, outcome: { kind: 'LEAD_HAS_ACTIVE_MEETING' } };
  const verdict = evaluateLeadStatusChange({
    from: lead.status,
    to: 'MEETING_SCHEDULED',
    origin: 'MEETING_BOOKED',
  });
  if (!verdict.ok) return { ok: false, outcome: { kind: 'LEAD_BLOCKED', reason: verdict.reason } };
  const window = {
    from: new Date(request.startsAt.getTime() - DAY_MS),
    to: new Date(request.startsAt.getTime() + DAY_MS),
  };
  const bookable = evaluateSlotBookability({
    calendar: await loadCalendarSnapshot(tx, row),
    busy: await loadBusyIntervals(tx, { row, ...window }),
    now: request.now,
    startsAt: request.startsAt,
  });
  if (!bookable.ok)
    return { ok: false, outcome: { kind: 'SLOT_UNAVAILABLE', reason: bookable.reason } };
  return { ok: true, lead, slot: bookable.slot, calendarId: row.id };
}

export async function recordBooking(
  tx: DatabaseExecutor,
  input: { request: MeetingBookingRequest; lead: LeadEntity; meeting: MeetingEntity },
) {
  const { request, lead, meeting } = input;
  await applyLeadStatusChange(tx, {
    lead,
    to: 'MEETING_SCHEDULED',
    origin: 'MEETING_BOOKED',
    actor: request.actor,
    meetingId: meeting.id,
  });
  await insertSchedulingAudit(tx, {
    organizationId: request.organizationId,
    actor: request.actor,
    action: 'meeting.booked',
    targetType: 'meeting',
    targetId: meeting.id,
    metadata: {
      calendarId: meeting.calendarId,
      leadId: lead.id,
      startsAt: meeting.startsAt.toISOString(),
      sourceAttemptId: request.sourceAttemptId ?? null,
    },
  });
}
