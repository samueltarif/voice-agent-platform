import type { DatabaseInstance } from '../client/connection.js';
import { BookingDecisionExpired } from './meeting-booking-guards.js';
import {
  bookingFingerprint,
  findMeetingByKey,
  findSlotOffer,
  mapBookingFailure,
  replayOutcome,
  type BookMeetingOutcome,
  type ManualBookingInput,
  type MeetingBookingRequest,
} from './meeting-booking-steps.js';
import { bookInTransaction } from './meeting-booking-transaction.js';
import type { OfferedBookingHooks } from './meeting-booking-validation.js';
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
 * E1 (DEC-074) — reserva transacional de reunião. Ordem GLOBAL de travas
 * (desenho §2.1): chave de idempotência → lead → agenda → oferta → tentativa
 * → telefone. O instante da decisão vem do relógio injetado e é lido DEPOIS
 * de todas elas; uma guarda final reavalia o tempo após a última escrita.
 * O banco ainda recusa sobreposição e duplicidade por lead, tentativa,
 * oferta e chave.
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

  /**
   * Reserva o horário EXATAMENTE oferecido (oferta do mesmo tenant e tentativa).
   * `hooks` (E2 PR 2) participam da MESMA transação; sem eles, nada muda.
   */
  async bookOfferedSlot(
    input: OfferedSlotBookingInput,
    hooks?: OfferedBookingHooks,
  ): Promise<BookMeetingOutcome> {
    // Reserva não atribuída a um usuário exige tentativa (2ª auditoria, A3).
    if (input.actor.type !== 'USER' && !input.sourceAttemptId) return { kind: 'ATTEMPT_REQUIRED' };
    const offer = await findSlotOffer(this.db, {
      organizationId: input.organizationId,
      offerId: input.offerId,
      lock: false,
    });
    if (!offer || offer.sourceAttemptId !== (input.sourceAttemptId ?? null))
      return { kind: 'OFFER_NOT_FOUND' };
    // Campos imutáveis da oferta; status e validade são decididos sob trava.
    return this.book(
      {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        actor: input.actor,
        calendarId: offer.calendarId,
        leadId: offer.leadId,
        startsAt: offer.startsAt,
        sourceAttemptId: offer.sourceAttemptId,
        slotOfferId: offer.id,
      },
      hooks,
    );
  }

  private async book(
    request: MeetingBookingRequest,
    hooks?: OfferedBookingHooks,
  ): Promise<BookMeetingOutcome> {
    if (!Number.isFinite(request.startsAt.getTime())) {
      return { kind: 'SLOT_UNAVAILABLE', reason: 'INVALID_START' };
    }
    const fingerprint = bookingFingerprint(request);
    try {
      return await this.db.transaction((tx) =>
        bookInTransaction(tx, { request, fingerprint, clock: this.clock, hooks }),
      );
    } catch (error) {
      if (error instanceof BookingDecisionExpired) return error.outcome;
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
