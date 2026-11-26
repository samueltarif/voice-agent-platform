import { evaluateLeadStatusChange, type TimeInterval } from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import type { MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { SchedulingCalendarEntity } from '../schema/scheduling-calendars.js';
import type { BookMeetingOutcome, MeetingBookingRequest } from './meeting-booking-steps.js';

const MINUTE_MS = 60_000;

/**
 * E1 (2ª auditoria, A3) — procedência obrigatória de toda reserva que NÃO é
 * de um usuário: oferta registrada E tentativa não nula, a mesma da oferta.
 * A ausência dos dois identificadores nunca equivale a uma correspondência.
 * A reserva administrativa de um usuário (sem tentativa) segue permitida.
 */
export function provenanceRefusal(
  request: MeetingBookingRequest,
  offer: MeetingSlotOfferEntity | null,
): BookMeetingOutcome | null {
  if (request.actor.type === 'USER') return null;
  if (!offer) return { kind: 'OFFER_REQUIRED' };
  if (!request.sourceAttemptId || !offer.sourceAttemptId) return { kind: 'ATTEMPT_REQUIRED' };
  return offer.sourceAttemptId === request.sourceAttemptId ? null : { kind: 'OFFER_NOT_FOUND' };
}

/** Condições que o PASSAR DO TEMPO pode violar entre a decisão e o commit. */
export interface TemporalConditions {
  readonly offerExpiresAt: Date | null;
  readonly startsAt: Date;
  readonly minimumNoticeMinutes: number;
}

/**
 * E1 (A2) — validade da oferta e antecedência mínima no instante `now`.
 * Usada na decisão (depois de TODAS as travas) e de novo como guarda final,
 * depois de todas as escritas e imediatamente antes do commit.
 */
export function temporalRefusal(
  conditions: TemporalConditions,
  now: Date,
): BookMeetingOutcome | null {
  if (conditions.offerExpiresAt && now.getTime() >= conditions.offerExpiresAt.getTime()) {
    return { kind: 'OFFER_EXPIRED' };
  }
  const earliest = now.getTime() + conditions.minimumNoticeMinutes * MINUTE_MS;
  if (conditions.startsAt.getTime() < earliest) {
    return { kind: 'SLOT_UNAVAILABLE', reason: 'INSIDE_MINIMUM_NOTICE' };
  }
  return null;
}

/**
 * Lançado pela guarda final para DESFAZER a transação inteira (reunião,
 * oferta, lead, histórico e auditoria) e devolver o resultado de negócio.
 */
export class BookingDecisionExpired extends Error {
  constructor(readonly outcome: BookMeetingOutcome) {
    super('Booking decision expired before commit.');
    this.name = 'BookingDecisionExpired';
  }
}

/** Prospecção ativa: telefone suprimido ou lead `DO_NOT_CALL` encerram o fluxo (A4). */
export function suppressionRefusal(
  offer: MeetingSlotOfferEntity | null,
  lead: LeadEntity,
  phoneSuppressed: boolean,
): BookMeetingOutcome | null {
  if (!offer) return null;
  return phoneSuppressed || lead.status === 'DO_NOT_CALL' ? { kind: 'LEAD_SUPPRESSED' } : null;
}

export function checkLeadStatus(lead: LeadEntity): BookMeetingOutcome | null {
  if (lead.status === 'MEETING_SCHEDULED') return { kind: 'LEAD_HAS_ACTIVE_MEETING' };
  const verdict = evaluateLeadStatusChange({
    from: lead.status,
    to: 'MEETING_SCHEDULED',
    origin: 'MEETING_BOOKED',
  });
  return verdict.ok ? null : { kind: 'LEAD_BLOCKED', reason: verdict.reason };
}

/** A1 — a oferta vale só para o intervalo INTEIRO que foi apresentado. */
export function offerMatchesSlot(
  offer: MeetingSlotOfferEntity | null,
  slot: TimeInterval,
): boolean {
  if (!offer) return true;
  return (
    offer.startsAt.getTime() === slot.startsAt.getTime() &&
    offer.endsAt.getTime() === slot.endsAt.getTime()
  );
}

/** Recusas decididas no instante `now` (depois de TODAS as travas). */
export function refusalAt(
  lead: LeadEntity,
  locked: { offer: MeetingSlotOfferEntity | null; phoneSuppressed: boolean },
  now: Date,
): BookMeetingOutcome | null {
  const { offer, phoneSuppressed } = locked;
  const expired = offer
    ? temporalRefusal(
        { offerExpiresAt: offer.expiresAt, startsAt: offer.startsAt, minimumNoticeMinutes: 0 },
        now,
      )
    : null;
  return expired ?? suppressionRefusal(offer, lead, phoneSuppressed) ?? checkLeadStatus(lead);
}

export function temporalConditions(
  row: SchedulingCalendarEntity,
  request: MeetingBookingRequest,
  offer: MeetingSlotOfferEntity | null,
): TemporalConditions {
  return {
    offerExpiresAt: offer ? offer.expiresAt : null,
    startsAt: request.startsAt,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
  };
}
