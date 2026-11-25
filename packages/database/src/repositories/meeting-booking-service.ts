import type { DatabaseInstance } from '../client/connection.js';
import { meetings } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import {
  bookingFingerprint,
  findMeetingByKey,
  findSlotOffer,
  lockIdempotencyKey,
  mapBookingFailure,
  replayOutcome,
  type BookMeetingOutcome,
  type ManualBookingInput,
  type MeetingBookingRequest,
} from './meeting-booking-steps.js';
import { recordBooking } from './meeting-booking-record.js';
import { resolveBookingTargets } from './meeting-booking-validation.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';

export interface OfferedSlotBookingInput {
  readonly organizationId: string;
  readonly offerId: string;
  readonly sourceAttemptId?: string | undefined;
  readonly idempotencyKey: string;
  readonly actor: SchedulingActor;
}

/**
 * E1 (DEC-074) — reserva transacional de reunião. Ordem fixa de travas:
 * chave de idempotência → lead → agenda → oferta (o cancelamento usa
 * lead → reunião; sem ciclo). O instante da decisão vem do relógio injetado
 * e é lido DEPOIS de todas as travas (auditoria A2). O banco ainda recusa
 * sobreposição, duplicidade por lead, por tentativa, por oferta e por chave.
 *
 * Dois caminhos, com garantias distintas:
 * - `bookMeeting`: reserva MANUAL de um usuário (ex.: cliente pediu por outro
 *   canal). Sem tentativa nem oferta; permitida mesmo com telefone suprimido,
 *   sem jamais remover a supressão.
 * - `bookOfferedSlot`: confirmação de uma oferta REGISTRADA (único caminho do
 *   agente). Recusada para telefone suprimido, tentativa que discou outra
 *   pessoa, oferta vencida, usada ou cujo intervalo não é mais o vigente.
 */
export class DrizzleMeetingBookingService {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async bookMeeting(input: ManualBookingInput): Promise<BookMeetingOutcome> {
    // O agente nunca reserva por horário livre: só por oferta registrada.
    if (input.actor.type !== 'USER') return { kind: 'OFFER_REQUIRED' };
    return this.book({ ...input, sourceAttemptId: null });
  }

  /** Reserva o horário EXATAMENTE oferecido (oferta do mesmo tenant e tentativa). */
  async bookOfferedSlot(input: OfferedSlotBookingInput): Promise<BookMeetingOutcome> {
    const offer = await findSlotOffer(this.db, {
      organizationId: input.organizationId,
      offerId: input.offerId,
      lock: false,
    });
    if (!offer || offer.sourceAttemptId !== (input.sourceAttemptId ?? null))
      return { kind: 'OFFER_NOT_FOUND' };
    // Campos imutáveis da oferta; status e validade são decididos sob trava.
    return this.book({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      actor: input.actor,
      calendarId: offer.calendarId,
      leadId: offer.leadId,
      startsAt: offer.startsAt,
      sourceAttemptId: offer.sourceAttemptId,
      slotOfferId: offer.id,
    });
  }

  private async book(request: MeetingBookingRequest): Promise<BookMeetingOutcome> {
    if (!Number.isFinite(request.startsAt.getTime())) {
      return { kind: 'SLOT_UNAVAILABLE', reason: 'INVALID_START' };
    }
    const fingerprint = bookingFingerprint(request);
    try {
      return await this.db.transaction((tx) =>
        bookInTransaction(tx, { request, fingerprint, clock: this.clock }),
      );
    } catch (error) {
      const mapped = mapBookingFailure(classifyPostgresFailure(error));
      if (mapped === 'REREAD') {
        const winner = await findMeetingByKey(
          this.db,
          request.organizationId,
          request.idempotencyKey,
        );
        if (winner) return replayOutcome(winner, fingerprint);
      }
      if (mapped && mapped !== 'REREAD') return mapped;
      throw error;
    }
  }
}

async function bookInTransaction(
  tx: DatabaseExecutor,
  input: { request: MeetingBookingRequest; fingerprint: string; clock: () => Date },
): Promise<BookMeetingOutcome> {
  const { request, fingerprint } = input;
  await lockIdempotencyKey(tx, request.organizationId, request.idempotencyKey);
  const lead = await lockLead(tx, request.organizationId, request.leadId);
  // A chave é lida depois das travas: repetições concorrentes veem a vencedora,
  // e uma reserva válida é repetida mesmo que a oferta já tenha vencido.
  const existing = await findMeetingByKey(tx, request.organizationId, request.idempotencyKey);
  if (existing) return replayOutcome(existing, fingerprint);
  if (!lead) return { kind: 'LEAD_NOT_FOUND' };
  const targets = await resolveBookingTargets(tx, { request, lead, clock: input.clock });
  if (!targets.ok) return targets.outcome;
  const [meeting] = await tx
    .insert(meetings)
    .values({
      organizationId: request.organizationId,
      calendarId: targets.calendarId,
      leadId: lead.id,
      startsAt: targets.slot.startsAt,
      endsAt: targets.slot.endsAt,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: fingerprint,
      sourceAttemptId: request.sourceAttemptId ?? null,
      slotOfferId: targets.offer?.id ?? null,
      bookedByType: request.actor.type,
      bookedById: request.actor.id,
    })
    .returning();
  await recordBooking(tx, { request, lead, meeting: meeting!, offer: targets.offer });
  return { kind: 'BOOKED', meeting: meeting! };
}
