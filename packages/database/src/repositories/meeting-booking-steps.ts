import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type {
  LeadStatusChangeBlockReason,
  SlotBookabilityBlockReason,
} from '@voice-agent/contracts';
import { meetingSlotOffers, type MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import { meetings, type MeetingEntity } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { PostgresFailure } from './outbound-persistence-errors.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';

/**
 * E1 (DEC-074) — pedido de reserva já resolvido no servidor. Não carrega o
 * instante da decisão: ele é lido do relógio da aplicação DEPOIS das travas
 * (auditoria A2). `slotOfferId`/`sourceAttemptId` só vêm de uma oferta
 * registrada (`bookOfferedSlot`), nunca do chamador da reserva manual.
 */
export interface MeetingBookingRequest {
  readonly organizationId: string;
  readonly calendarId: string;
  readonly leadId: string;
  readonly startsAt: Date;
  readonly idempotencyKey: string;
  readonly actor: SchedulingActor;
  readonly sourceAttemptId?: string | null | undefined;
  readonly slotOfferId?: string | undefined;
}

/** Reserva manual (painel): sempre por um usuário, sem tentativa nem oferta. */
export type ManualBookingInput = Omit<MeetingBookingRequest, 'sourceAttemptId' | 'slotOfferId'>;

export type BookMeetingOutcome =
  | { readonly kind: 'BOOKED' | 'REPLAYED'; readonly meeting: MeetingEntity }
  | {
      readonly kind:
        | 'IDEMPOTENCY_KEY_REUSED'
        | 'CALENDAR_NOT_FOUND'
        | 'LEAD_NOT_FOUND'
        | 'LEAD_HAS_ACTIVE_MEETING'
        | 'ATTEMPT_HAS_ACTIVE_MEETING'
        | 'OFFER_NOT_FOUND'
        | 'OFFER_EXPIRED'
        | 'OFFER_ALREADY_USED'
        | 'OFFER_STALE'
        | 'OFFER_REQUIRED'
        | 'ATTEMPT_NOT_FOUND'
        | 'ATTEMPT_LEAD_MISMATCH'
        | 'LEAD_SUPPRESSED';
    }
  | { readonly kind: 'LEAD_BLOCKED'; readonly reason: LeadStatusChangeBlockReason }
  | { readonly kind: 'SLOT_UNAVAILABLE'; readonly reason: SlotBookabilityBlockReason };

/**
 * Impressão digital do pedido: a mesma chave só é "repetição" se o pedido
 * (agenda, lead, horário, tentativa e oferta) for idêntico.
 */
export function bookingFingerprint(request: MeetingBookingRequest): string {
  const parts = [
    request.calendarId,
    request.leadId,
    request.startsAt.toISOString(),
    request.sourceAttemptId ?? '',
    request.slotOfferId ?? '',
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/**
 * Auditoria M4 — serializa, por (tenant, chave), pedidos com a MESMA chave de
 * idempotência, ainda que para leads ou agendas diferentes. Assim o segundo
 * pedido sempre vê o primeiro e responde repetição ou reuso da chave, nunca
 * um conflito de horário que mascararia o reuso. Trava transacional (liberada
 * no commit/rollback); colisões de hash apenas serializam mais.
 */
export async function lockIdempotencyKey(
  executor: DatabaseExecutor,
  organizationId: string,
  idempotencyKey: string,
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId} || ':meeting-key:' || ${idempotencyKey}, 0))`,
  );
}

export async function findMeetingByKey(
  executor: DatabaseExecutor,
  organizationId: string,
  idempotencyKey: string,
): Promise<MeetingEntity | null> {
  const [row] = await executor
    .select()
    .from(meetings)
    .where(
      and(eq(meetings.organizationId, organizationId), eq(meetings.idempotencyKey, idempotencyKey)),
    );
  return row ?? null;
}

export function replayOutcome(existing: MeetingEntity, fingerprint: string): BookMeetingOutcome {
  return existing.requestFingerprint === fingerprint
    ? { kind: 'REPLAYED', meeting: existing }
    : { kind: 'IDEMPOTENCY_KEY_REUSED' };
}

/** Oferta do tenant, opcionalmente travada (`FOR UPDATE`) dentro da transação. */
export async function findSlotOffer(
  executor: DatabaseExecutor,
  input: { readonly organizationId: string; readonly offerId: string; readonly lock: boolean },
): Promise<MeetingSlotOfferEntity | null> {
  const query = executor
    .select()
    .from(meetingSlotOffers)
    .where(
      and(
        eq(meetingSlotOffers.id, input.offerId),
        eq(meetingSlotOffers.organizationId, input.organizationId),
      ),
    );
  const [row] = input.lock ? await query.for('update') : await query;
  return row ?? null;
}

export async function markOfferAccepted(executor: DatabaseExecutor, offer: MeetingSlotOfferEntity) {
  await executor
    .update(meetingSlotOffers)
    .set({ status: 'ACCEPTED' })
    .where(
      and(
        eq(meetingSlotOffers.id, offer.id),
        eq(meetingSlotOffers.organizationId, offer.organizationId),
      ),
    );
}

const OUTCOME_BY_CONSTRAINT: Readonly<Record<string, BookMeetingOutcome>> = {
  meetings_one_active_per_lead_uidx: { kind: 'LEAD_HAS_ACTIVE_MEETING' },
  meetings_one_active_per_attempt_uidx: { kind: 'ATTEMPT_HAS_ACTIVE_MEETING' },
  meetings_slot_offer_uidx: { kind: 'OFFER_ALREADY_USED' },
  meetings_no_overlap_excl: { kind: 'SLOT_UNAVAILABLE', reason: 'SLOT_CONFLICT' },
  meetings_attempt_org_fk: { kind: 'ATTEMPT_NOT_FOUND' },
};

/**
 * Violações do banco viram resultados de negócio; a chave de idempotência
 * concorrente devolve `'REREAD'` (defesa em profundidade: com a trava da
 * chave, a outra transação já terá sido vista antes do INSERT).
 */
export function mapBookingFailure(failure: PostgresFailure): BookMeetingOutcome | 'REREAD' | null {
  if (failure.constraint === 'meetings_org_idempotency_unique') return 'REREAD';
  if (failure.constraint === null) return null;
  return OUTCOME_BY_CONSTRAINT[failure.constraint] ?? null;
}
