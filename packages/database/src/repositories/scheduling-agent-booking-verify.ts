import { and, eq } from 'drizzle-orm';
import {
  renderBookedSpeech,
  renderRefusalSpeech,
  renderSlotLabel,
  SCHEDULING_SPEECH,
  type ConfirmOfferResult,
  type NotBookedReason,
  type SchedulingRefusal,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { callSessions } from '../schema/call-sessions.js';
import { meetings, type MeetingEntity } from '../schema/meetings.js';
import { calendarTimezone, readProtocolRow } from './scheduling-agent-scope.js';
import type { SchedulingBinding } from './scheduling-protocol-store.js';

/**
 * E2 PR 2 (DEC-075, A5) — verdade da fala do agente. Lê o estado COMMITADO e
 * a reunião PERSISTIDA; só `BOOKED` com reunião agendada da mesma oferta,
 * tentativa e lead, e sessão ainda ativa, autoriza o anúncio. Um resultado
 * canônico sem estado coerente é `UNKNOWN`: nunca sucesso nem fracasso.
 */

export const refusedResult = (reason: SchedulingRefusal): ConfirmOfferResult => ({
  status: 'REFUSED',
  reason,
  mayAnnounceBooking: false,
  speech: renderRefusalSpeech(reason),
});

export const UNKNOWN_RESULT: ConfirmOfferResult = {
  status: 'UNKNOWN',
  mayAnnounceBooking: false,
  speech: SCHEDULING_SPEECH.UNKNOWN,
};

const COARSE: Readonly<Record<string, NotBookedReason>> = {
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  OFFER_ALREADY_USED: 'SLOT_UNAVAILABLE',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  OFFER_STALE: 'OFFER_EXPIRED',
  TECHNICAL_FAILURE: 'TECHNICAL_FAILURE',
};

/** O motivo exato da E1 (supressão, reunião ativa…) fica no servidor; o modelo recebe a categoria. */
export const notBookedResult = (outcome: string): ConfirmOfferResult => ({
  status: 'NOT_BOOKED',
  outcome: COARSE[outcome] ?? 'NOT_BOOKABLE',
  mayAnnounceBooking: false,
  speech: SCHEDULING_SPEECH.NOT_BOOKED,
});

export interface VerifyInput {
  readonly binding: SchedulingBinding;
  readonly leadId: string;
  readonly offerId: string;
  readonly recovered: boolean;
}

async function persistedMeeting(db: DatabaseInstance, binding: SchedulingBinding) {
  const row = await readProtocolRow(db, binding);
  const meetingId = row?.state.phase === 'BOOKED' ? row.state.meetingId : null;
  if (!meetingId) return null;
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.organizationId, binding.organizationId)));
  return meeting ?? 'MISSING';
}

function matches(meeting: MeetingEntity, input: VerifyInput): boolean {
  return (
    meeting.status === 'SCHEDULED' &&
    meeting.slotOfferId === input.offerId &&
    meeting.sourceAttemptId === input.binding.attemptId &&
    meeting.leadId === input.leadId
  );
}

export async function sessionIsActive(db: DatabaseInstance, binding: SchedulingBinding) {
  const [session] = await db
    .select({ state: callSessions.runtimeState })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.id, binding.sessionId),
        eq(callSessions.organizationId, binding.organizationId),
      ),
    );
  return session?.state === 'ACTIVE';
}

/** `null` = o estado commitado não registra reunião (não houve reserva). */
export async function verifiedBooking(
  db: DatabaseInstance,
  input: VerifyInput,
): Promise<ConfirmOfferResult | null> {
  const meeting = await persistedMeeting(db, input.binding);
  if (meeting === null) return null;
  if (meeting === 'MISSING') return UNKNOWN_RESULT;
  // A6: a fase BOOKED histórica não prova reunião ativa (ex.: cancelada depois).
  if (!matches(meeting, input)) return notBookedResult('MEETING_NOT_ACTIVE');
  if (!(await sessionIsActive(db, input.binding))) return refusedResult('SESSION_NOT_ACTIVE');
  const timezone = await calendarTimezone(db, {
    organizationId: input.binding.organizationId,
    calendarId: meeting.calendarId,
  });
  return {
    status: 'BOOKED',
    recovered: input.recovered,
    mayAnnounceBooking: true,
    speech: renderBookedSpeech(renderSlotLabel(meeting.startsAt, timezone ?? 'UTC')),
  };
}
