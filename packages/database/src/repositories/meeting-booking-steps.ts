import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  LeadStatusChangeBlockReason,
  SlotBookabilityBlockReason,
} from '@voice-agent/contracts';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { meetings, type MeetingEntity } from '../schema/meetings.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { PostgresFailure } from './outbound-persistence-errors.js';
import type { SchedulingActor } from './scheduling-audit-entry.js';

/** E1 (DEC-074) — pedido de reserva já resolvido no servidor. */
export interface MeetingBookingRequest {
  readonly organizationId: string;
  readonly calendarId: string;
  readonly leadId: string;
  readonly startsAt: Date;
  readonly idempotencyKey: string;
  readonly actor: SchedulingActor;
  readonly now: Date;
  readonly sourceAttemptId?: string | undefined;
  readonly slotOfferId?: string | undefined;
}

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
        | 'ATTEMPT_NOT_FOUND';
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

/** Oferta ainda disponível? Travada para que só uma reserva a consuma. */
export async function claimSlotOffer(
  executor: DatabaseExecutor,
  request: MeetingBookingRequest,
): Promise<'CLAIMED' | 'OFFER_ALREADY_USED'> {
  if (!request.slotOfferId) return 'CLAIMED';
  const [offer] = await executor
    .update(meetingSlotOffers)
    .set({ status: 'ACCEPTED' })
    .where(
      and(
        eq(meetingSlotOffers.id, request.slotOfferId),
        eq(meetingSlotOffers.organizationId, request.organizationId),
        eq(meetingSlotOffers.status, 'OFFERED'),
      ),
    )
    .returning({ id: meetingSlotOffers.id });
  return offer ? 'CLAIMED' : 'OFFER_ALREADY_USED';
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
 * concorrente devolve `'REREAD'` (a outra transação venceu e é relida).
 */
export function mapBookingFailure(failure: PostgresFailure): BookMeetingOutcome | 'REREAD' | null {
  if (failure.constraint === 'meetings_org_idempotency_unique') return 'REREAD';
  if (failure.constraint === null) return null;
  return OUTCOME_BY_CONSTRAINT[failure.constraint] ?? null;
}
