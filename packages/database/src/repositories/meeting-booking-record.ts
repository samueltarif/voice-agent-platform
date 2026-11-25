import type { LeadEntity } from '../schema/leads.js';
import type { MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { MeetingEntity } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyLeadStatusChange } from './lead-status-writer.js';
import { markOfferAccepted, type MeetingBookingRequest } from './meeting-booking-steps.js';
import { insertSchedulingAudit } from './scheduling-audit-entry.js';

/** E1 (DEC-074) — registro da reserva validada: oferta consumida, lead, histórico e auditoria. */
export async function recordBooking(
  tx: DatabaseExecutor,
  input: {
    request: MeetingBookingRequest;
    lead: LeadEntity;
    meeting: MeetingEntity;
    offer: MeetingSlotOfferEntity | null;
  },
) {
  const { request, lead, meeting, offer } = input;
  if (offer) await markOfferAccepted(tx, offer);
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
      slotOfferId: offer?.id ?? null,
    },
  });
}
