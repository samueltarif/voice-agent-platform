import {
  evaluateLeadStatusChange,
  evaluateSlotBookability,
  type TimeInterval,
} from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import type { MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { SchedulingCalendarEntity as CalendarRow } from '../schema/scheduling-calendars.js';
import { isLeadPhoneSuppressed, verifyAttemptDialsLead } from './attempt-lead-association.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  findSlotOffer,
  type BookMeetingOutcome,
  type MeetingBookingRequest,
} from './meeting-booking-steps.js';
import {
  findCalendarRow,
  loadBusyIntervals,
  loadCalendarSnapshot,
} from './scheduling-calendar-snapshot.js';

const DAY_MS = 86_400_000;

/** E1 (DEC-074) — validação autoritativa e registro de uma reserva, dentro da transação. */

export interface BookingContext {
  readonly request: MeetingBookingRequest;
  readonly lead: LeadEntity;
  /** Relógio da aplicação, lido só depois de todas as travas (auditoria A2). */
  readonly clock: () => Date;
}

export type BookingTargets =
  | { readonly ok: false; readonly outcome: BookMeetingOutcome }
  | {
      readonly ok: true;
      readonly slot: TimeInterval;
      readonly calendarId: string;
      readonly offer: MeetingSlotOfferEntity | null;
    };

type Check<T> =
  | { readonly ok: false; readonly outcome: BookMeetingOutcome }
  | { readonly ok: true; readonly value: T };
const fail = (outcome: BookMeetingOutcome) => ({ ok: false as const, outcome });

/** Trava a oferta (se houver) e exige que ainda esteja em aberto. */
async function lockOpenOffer(
  tx: DatabaseExecutor,
  request: MeetingBookingRequest,
): Promise<Check<MeetingSlotOfferEntity | null>> {
  if (!request.slotOfferId) return { ok: true, value: null };
  const offer = await findSlotOffer(tx, {
    organizationId: request.organizationId,
    offerId: request.slotOfferId,
    lock: true,
  });
  if (!offer) return fail({ kind: 'OFFER_NOT_FOUND' });
  if (offer.status !== 'OFFERED') return fail({ kind: 'OFFER_ALREADY_USED' });
  return { ok: true, value: offer };
}

/**
 * Prospecção ativa (oferta do agente): telefone suprimido ou lead
 * `DO_NOT_CALL` encerram o fluxo (A4); a tentativa precisa ter discado
 * exatamente o telefone do lead (A3), resolvido no servidor.
 */
async function checkProspecting(
  tx: DatabaseExecutor,
  context: BookingContext,
  offer: MeetingSlotOfferEntity | null,
): Promise<BookMeetingOutcome | null> {
  const { request, lead } = context;
  if (offer) {
    if (lead.status === 'DO_NOT_CALL') return { kind: 'LEAD_SUPPRESSED' };
    if (await isLeadPhoneSuppressed(tx, request.organizationId, lead.id))
      return { kind: 'LEAD_SUPPRESSED' };
  }
  if (!request.sourceAttemptId) return null;
  const association = await verifyAttemptDialsLead(tx, {
    organizationId: request.organizationId,
    attemptId: request.sourceAttemptId,
    leadId: lead.id,
  });
  return association === 'MATCH' ? null : { kind: association };
}

function checkLeadStatus(lead: LeadEntity): BookMeetingOutcome | null {
  if (lead.status === 'MEETING_SCHEDULED') return { kind: 'LEAD_HAS_ACTIVE_MEETING' };
  const verdict = evaluateLeadStatusChange({
    from: lead.status,
    to: 'MEETING_SCHEDULED',
    origin: 'MEETING_BOOKED',
  });
  return verdict.ok ? null : { kind: 'LEAD_BLOCKED', reason: verdict.reason };
}

async function revalidateSlot(
  tx: DatabaseExecutor,
  input: { row: CalendarRow; startsAt: Date; now: Date },
): Promise<Check<TimeInterval>> {
  const { row, startsAt, now } = input;
  const window = {
    from: new Date(startsAt.getTime() - DAY_MS),
    to: new Date(startsAt.getTime() + DAY_MS),
  };
  const bookable = evaluateSlotBookability({
    calendar: await loadCalendarSnapshot(tx, row),
    busy: await loadBusyIntervals(tx, { row, ...window }),
    now,
    startsAt,
  });
  if (!bookable.ok) return fail({ kind: 'SLOT_UNAVAILABLE', reason: bookable.reason });
  return { ok: true, value: bookable.slot };
}

function offerExpiry(offer: MeetingSlotOfferEntity | null, now: Date): BookMeetingOutcome | null {
  return offer && offer.expiresAt.getTime() <= now.getTime() ? { kind: 'OFFER_EXPIRED' } : null;
}

/** A1 — a oferta vale só para o intervalo INTEIRO que foi apresentado. */
function offerMatchesSlot(offer: MeetingSlotOfferEntity | null, slot: TimeInterval): boolean {
  if (!offer) return true;
  return (
    offer.startsAt.getTime() === slot.startsAt.getTime() &&
    offer.endsAt.getTime() === slot.endsAt.getTime()
  );
}

/**
 * Trava agenda e oferta, LÊ O RELÓGIO e só então revalida validade da oferta,
 * supressão, tentativa ↔ lead, status do lead, horário e intervalo ofertado.
 * Nada é escrito aqui: qualquer recusa deixa oferta e lead intactos.
 */
export async function resolveBookingTargets(
  tx: DatabaseExecutor,
  context: BookingContext,
): Promise<BookingTargets> {
  const { request, lead } = context;
  const row = await findCalendarRow(tx, { ...request, lock: true });
  if (!row) return fail({ kind: 'CALENDAR_NOT_FOUND' });
  const offer = await lockOpenOffer(tx, request);
  if (!offer.ok) return offer;
  const decisionNow = context.clock();
  const refused =
    offerExpiry(offer.value, decisionNow) ??
    (await checkProspecting(tx, context, offer.value)) ??
    checkLeadStatus(lead);
  if (refused) return fail(refused);
  const slot = await revalidateSlot(tx, { row, startsAt: request.startsAt, now: decisionNow });
  if (!slot.ok) return slot;
  if (!offerMatchesSlot(offer.value, slot.value)) return fail({ kind: 'OFFER_STALE' });
  return { ok: true, slot: slot.value, calendarId: row.id, offer: offer.value };
}
