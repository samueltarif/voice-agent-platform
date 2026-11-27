import type { BookingIntentEntity } from '../schema/booking-intents.js';
import { decideIntent, lockIntent } from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import type { BookMeetingOutcome } from './meeting-booking-steps.js';

/**
 * E2 simplificada (DEC-077) — efetivação de uma intenção ACEITA no histórico
 * pela reserva transacional da E1 (`bookOfferedSlot`, mesma oferta e
 * tentativa, chave de idempotência derivada da intenção). Ordem
 * K → L → C → O → A → I → P: a intenção é travada no gancho entre a
 * tentativa e o telefone e só é marcada `BOOKED` na MESMA transação da
 * reunião. Oferta vencida, horário ocupado, lead suprimido ou bloqueado: nada
 * é reservado e o resultado volta para a revisão humana. A4: na MESMA
 * transação, depois de I, a reconciliação (R) precisa continuar com este
 * relatório vigente (sem conflito nem decisão humana); senão, nada é reservado.
 */

class IntentNotPending extends Error {
  constructor() {
    super('Booking intent is no longer pending');
    this.name = 'IntentNotPending';
  }
}

class ReportNotCurrent extends Error {
  constructor() {
    super('Post-call report is no longer the current one');
    this.name = 'ReportNotCurrent';
  }
}

export type IntentBookingResult =
  | { readonly kind: 'BOOKED'; readonly meetingId: string }
  | { readonly kind: 'NOT_PENDING' }
  | { readonly kind: 'NOT_CURRENT' }
  | { readonly kind: 'REFUSED'; readonly reason: string };

const booked = (outcome: BookMeetingOutcome) =>
  outcome.kind === 'BOOKED' || outcome.kind === 'REPLAYED' ? outcome.meeting : null;

export function intentIdempotencyKey(intent: Pick<BookingIntentEntity, 'id'>): string {
  return `booking-intent:${intent.id}`;
}

export async function bookAcceptedIntent(
  bookings: DrizzleMeetingBookingService,
  input: {
    readonly intent: BookingIntentEntity;
    readonly agentId: string;
    readonly now: () => Date;
    /** Confere R depois de I (relatório ainda vigente). */
    readonly reportCurrent: (tx: DatabaseExecutor) => Promise<boolean>;
  },
): Promise<IntentBookingResult> {
  const { intent } = input;
  const key = { organizationId: intent.organizationId, intentId: intent.id };
  try {
    const outcome = await bookings.bookOfferedSlot(
      {
        organizationId: intent.organizationId,
        offerId: intent.offerId,
        sourceAttemptId: intent.attemptId,
        idempotencyKey: intentIdempotencyKey(intent),
        actor: { type: 'AGENT', id: input.agentId },
      },
      {
        afterAttemptLock: async (tx) => {
          const locked = await lockIntent(tx, key);
          if (locked?.status !== 'PENDING_EVIDENCE') throw new IntentNotPending();
          if (!(await input.reportCurrent(tx))) throw new ReportNotCurrent();
        },
        beforeCommit: async (tx, result) => {
          const meeting = booked(result);
          if (!meeting) return;
          const decision = { status: 'BOOKED' as const, reason: 'LEAD_AFFIRMED_READBACK' };
          await decideIntent(tx, intent, { ...decision, meetingId: meeting.id, now: input.now() });
        },
      },
    );
    const meeting = booked(outcome);
    return meeting ? { kind: 'BOOKED', meetingId: meeting.id } : refusedOf(outcome);
  } catch (error) {
    if (error instanceof IntentNotPending) return { kind: 'NOT_PENDING' };
    if (error instanceof ReportNotCurrent) return { kind: 'NOT_CURRENT' };
    throw error;
  }
}

function refusedOf(outcome: BookMeetingOutcome): IntentBookingResult {
  const detail = 'reason' in outcome ? `:${String(outcome.reason)}` : '';
  return { kind: 'REFUSED', reason: `BOOKING_${outcome.kind}${detail}` };
}
