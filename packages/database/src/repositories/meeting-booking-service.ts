import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { meetings } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import {
  bookingFingerprint,
  claimSlotOffer,
  findMeetingByKey,
  mapBookingFailure,
  replayOutcome,
  type BookMeetingOutcome,
  type MeetingBookingRequest,
} from './meeting-booking-steps.js';
import { recordBooking, resolveBookingTargets } from './meeting-booking-validation.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';

/**
 * E1 (DEC-074) — reserva transacional de reunião. Ordem fixa de travas
 * (lead → agenda → oferta) evita deadlock com o cancelamento (lead → reunião).
 * O horário é revalidado contra a agenda e as reuniões ativas DENTRO da
 * transação; o banco ainda recusa sobreposição, duplicidade por lead, por
 * tentativa e por chave de idempotência.
 */
export class DrizzleMeetingBookingService {
  constructor(private readonly db: DatabaseInstance) {}

  bookMeeting(request: Omit<MeetingBookingRequest, 'slotOfferId'>): Promise<BookMeetingOutcome> {
    return this.book(request);
  }

  /** Reserva o horário EXATAMENTE oferecido (oferta válida, do mesmo lead e tentativa). */
  async bookOfferedSlot(input: {
    readonly organizationId: string;
    readonly offerId: string;
    readonly sourceAttemptId?: string | undefined;
    readonly idempotencyKey: string;
    readonly actor: SchedulingActor;
    readonly now: Date;
  }): Promise<BookMeetingOutcome> {
    const [offer] = await this.db
      .select()
      .from(meetingSlotOffers)
      .where(
        and(
          eq(meetingSlotOffers.id, input.offerId),
          eq(meetingSlotOffers.organizationId, input.organizationId),
        ),
      );
    if (!offer || offer.sourceAttemptId !== (input.sourceAttemptId ?? null))
      return { kind: 'OFFER_NOT_FOUND' };
    const request: MeetingBookingRequest = {
      ...input,
      calendarId: offer.calendarId,
      leadId: offer.leadId,
      startsAt: offer.startsAt,
      slotOfferId: offer.id,
    };
    const existing = await findMeetingByKey(this.db, input.organizationId, input.idempotencyKey);
    if (existing) return replayOutcome(existing, bookingFingerprint(request));
    if (offer.expiresAt.getTime() <= input.now.getTime()) return { kind: 'OFFER_EXPIRED' };
    return this.book(request);
  }

  private async book(request: MeetingBookingRequest): Promise<BookMeetingOutcome> {
    if (!Number.isFinite(request.startsAt.getTime())) {
      return { kind: 'SLOT_UNAVAILABLE', reason: 'INVALID_START' };
    }
    const fingerprint = bookingFingerprint(request);
    try {
      return await this.db.transaction((tx) => bookInTransaction(tx, request, fingerprint));
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
  request: MeetingBookingRequest,
  fingerprint: string,
): Promise<BookMeetingOutcome> {
  // A trava do lead serializa pedidos do mesmo lead; a chave é lida DEPOIS
  // dela, para que repetições concorrentes vejam a reserva vencedora.
  const lead = await lockLead(tx, request.organizationId, request.leadId);
  if (!lead) return { kind: 'LEAD_NOT_FOUND' };
  const existing = await findMeetingByKey(tx, request.organizationId, request.idempotencyKey);
  if (existing) return replayOutcome(existing, fingerprint);
  const targets = await resolveBookingTargets(tx, request, lead);
  if (!targets.ok) return targets.outcome;
  if ((await claimSlotOffer(tx, request)) === 'OFFER_ALREADY_USED')
    return { kind: 'OFFER_ALREADY_USED' };
  const [meeting] = await tx
    .insert(meetings)
    .values({
      organizationId: request.organizationId,
      calendarId: targets.calendarId,
      leadId: targets.lead.id,
      startsAt: targets.slot.startsAt,
      endsAt: targets.slot.endsAt,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: fingerprint,
      sourceAttemptId: request.sourceAttemptId ?? null,
      slotOfferId: request.slotOfferId ?? null,
      bookedByType: request.actor.type,
      bookedById: request.actor.id,
    })
    .returning();
  await recordBooking(tx, { request, lead: targets.lead, meeting: meeting! });
  return { kind: 'BOOKED', meeting: meeting! };
}
