import type { ProtocolOfferList, RequestBookingArguments } from '@voice-agent/contracts';
import { bookingIntents, type BookingIntentEntity } from '../schema/booking-intents.js';
import {
  decideIntent,
  hasEarlierRequest,
  lockPendingIntent,
  sessionIntents,
} from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { SchedulingBinding } from './scheduling-protocol-store.js';

/**
 * Auditoria #184 A2 — o que um `request_booking` faz com as intenções (trava I),
 * sem identificador de invocação comprovado do provedor:
 * - novo pedido, ou pedido igual ao pendente (idempotente) ⇒ `RECORDED`: existe
 *   uma intenção pendente desta opção;
 * - pedido igual a outro já substituído (reentrega ou mudança de ideia,
 *   indistinguíveis) ⇒ a pendente vai para revisão (`REQUEST_ORDER_AMBIGUOUS`);
 *   sessão já em revisão ⇒ nada é registrado. Ambos `HELD`: nenhuma intenção
 *   desta opção existe, e a resposta da ferramenta diz isso (reauditoria).
 */

export type Offer = ProtocolOfferList['offers'][number];

export interface RecordInput {
  readonly binding: SchedulingBinding;
  readonly leadId: string;
  readonly phoneE164: string;
  readonly args: RequestBookingArguments;
  readonly now: Date;
}

const AMBIGUOUS = 'REQUEST_ORDER_AMBIGUOUS';

const sameChoice = (intent: BookingIntentEntity | null, args: RequestBookingArguments) =>
  intent?.listRevision === args.listRevision && intent.option === args.option;

export async function applyRequest(
  tx: DatabaseExecutor,
  offer: Offer,
  input: RecordInput,
): Promise<'RECORDED' | 'HELD'> {
  const { binding, args, now } = input;
  const key = { organizationId: binding.organizationId, sessionId: binding.sessionId };
  const pending = await lockPendingIntent(tx, key);
  if (sameChoice(pending, args)) return 'RECORDED';
  if (pending && (await hasEarlierRequest(tx, key, args))) {
    await decideIntent(tx, pending, { status: 'NEEDS_REVIEW', reason: AMBIGUOUS, now });
    return 'HELD';
  }
  if ((await sessionIntents(tx, key)).reviewReasons.length > 0) return 'HELD';
  if (pending)
    await decideIntent(tx, pending, { status: 'SUPERSEDED', reason: 'NEW_REQUEST', now });
  await tx.insert(bookingIntents).values({
    organizationId: binding.organizationId,
    sessionId: binding.sessionId,
    attemptId: binding.attemptId,
    leadId: input.leadId,
    offerId: offer.offerId,
    listRevision: args.listRevision,
    option: args.option,
    leadConfirmation: args.leadConfirmation,
  });
  return 'RECORDED';
}
