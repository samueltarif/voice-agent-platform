import { evaluateSlotBookability, type TimeInterval } from '@voice-agent/contracts';
import type { LeadEntity } from '../schema/leads.js';
import type { MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { SchedulingCalendarEntity as CalendarRow } from '../schema/scheduling-calendars.js';
import { isLeadPhoneSuppressed, verifyAttemptDialsLead } from './attempt-lead-association.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  offerMatchesSlot,
  provenanceRefusal,
  refusalAt,
  temporalConditions,
  type TemporalConditions,
} from './meeting-booking-guards.js';
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
  /** Relógio da aplicação, lido só depois de TODAS as travas, inclusive a do telefone (A2). */
  readonly clock: () => Date;
}

export type BookingTargets =
  | { readonly ok: false; readonly outcome: BookMeetingOutcome }
  | {
      readonly ok: true;
      readonly slot: TimeInterval;
      readonly calendarId: string;
      readonly offer: MeetingSlotOfferEntity | null;
      readonly temporal: TemporalConditions;
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
 * Travas da prospecção (só no caminho com oferta/tentativa), NA ORDEM GLOBAL:
 * tentativa (`FOR KEY SHARE`, ao verificar que discou o telefone do lead, A3)
 * e, por ÚLTIMO, o telefone (leitura linearizada da supressão, A4). Devolve se
 * o telefone está suprimido; a decisão só é tomada depois, com o relógio.
 */
async function lockProspecting(
  tx: DatabaseExecutor,
  context: BookingContext,
  offer: MeetingSlotOfferEntity | null,
): Promise<Check<boolean>> {
  const { request, lead } = context;
  const refused = provenanceRefusal(request, offer);
  if (refused) return fail(refused);
  if (request.sourceAttemptId) {
    const association = await verifyAttemptDialsLead(tx, {
      organizationId: request.organizationId,
      attemptId: request.sourceAttemptId,
      leadId: lead.id,
    });
    if (association !== 'MATCH') return fail({ kind: association });
  }
  if (!offer) return { ok: true, value: false };
  return { ok: true, value: await isLeadPhoneSuppressed(tx, request.organizationId, lead.id) };
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

/**
 * Adquire TODAS as travas (agenda → oferta → tentativa → telefone), só então
 * LÊ O RELÓGIO e decide: validade da oferta, supressão, status do lead,
 * horário e intervalo ofertado. Nada é escrito aqui: qualquer recusa deixa
 * oferta e lead intactos. As condições temporais voltam para a guarda final.
 */

export async function resolveBookingTargets(
  tx: DatabaseExecutor,
  context: BookingContext,
): Promise<BookingTargets> {
  const { request } = context;
  const row = await findCalendarRow(tx, { ...request, lock: true });
  if (!row) return fail({ kind: 'CALENDAR_NOT_FOUND' });
  const offer = await lockOpenOffer(tx, request);
  if (!offer.ok) return offer;
  const suppressed = await lockProspecting(tx, context, offer.value);
  if (!suppressed.ok) return suppressed;
  const decisionNow = context.clock();
  const refused = refusalAt(
    context.lead,
    { offer: offer.value, phoneSuppressed: suppressed.value },
    decisionNow,
  );
  if (refused) return fail(refused);
  const slot = await revalidateSlot(tx, { row, startsAt: request.startsAt, now: decisionNow });
  if (!slot.ok) return slot;
  if (!offerMatchesSlot(offer.value, slot.value)) return fail({ kind: 'OFFER_STALE' });
  const temporal = temporalConditions(row, request, offer.value);
  return { ok: true, slot: slot.value, calendarId: row.id, offer: offer.value, temporal };
}
