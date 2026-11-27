import {
  renderBookingPendingSpeech,
  renderRefusalSpeech,
  renderSlotLabel,
  type ProtocolOfferList,
  type RequestBookingArguments,
  type RequestBookingResult,
  type SchedulingAgentScope,
  type SchedulingRefusal,
} from '@voice-agent/contracts';
import { bookingIntents } from '../schema/booking-intents.js';
import { isLeadPhoneSuppressed } from './attempt-lead-association.js';
import { closePendingIntent } from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import { lockLead } from './lead-status-writer.js';
import { ensureReconciliation } from './post-call-reconciliation-store.js';
import type { SchedulingEventDeps } from './scheduling-agent-deps.js';
import { calendarTimezone, commercialBlock, resolveAgentScope } from './scheduling-agent-scope.js';
import {
  lockProtocol,
  type LockedProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 simplificada (DEC-077) — `scheduling.request_booking`. NÃO reserva:
 * registra a intenção PENDENTE da opção escolhida na lista ofertada NESTA
 * sessão (revisão vigente, oferta não vencida), sem opt-out e com o telefone
 * não suprimido. Ordem: L → A → S → I → R → P; a supressão é lida por último e,
 * se houver, desfaz tudo. A reserva transacional só acontece na
 * reconciliação pós-chamada, com aceite comprovado no histórico.
 */

class RequestAbort extends Error {
  constructor(readonly refusal: SchedulingRefusal) {
    super(`Booking request refused: ${refusal}`);
    this.name = 'RequestAbort';
  }
}

const refused = (reason: SchedulingRefusal): RequestBookingResult => ({
  status: 'REFUSED',
  reason,
  speech: renderRefusalSpeech(reason),
});

type Offer = ProtocolOfferList['offers'][number];

function chosenOffer(
  locked: LockedProtocol,
  args: RequestBookingArguments,
  now: Date,
): { readonly offer: Offer } | { readonly refusal: SchedulingRefusal } {
  const block = commercialBlock(locked);
  if (block) return { refusal: block };
  const list = locked.row.state.list;
  const offer = list?.revision === args.listRevision ? list.offers[args.option - 1] : undefined;
  if (!offer) return { refusal: 'OFFER_NOT_CURRENT' };
  return Date.parse(offer.expiresAt) > now.getTime() ? { offer } : { refusal: 'OFFER_EXPIRED' };
}

interface RecordInput {
  readonly binding: SchedulingBinding;
  readonly leadId: string;
  readonly phoneE164: string;
  readonly args: RequestBookingArguments;
  readonly now: Date;
}

async function recordIntent(tx: DatabaseExecutor, offer: Offer, input: RecordInput) {
  const { binding, args, now } = input;
  const key = { organizationId: binding.organizationId, sessionId: binding.sessionId };
  await closePendingIntent(tx, key, { status: 'SUPERSEDED', reason: 'NEW_REQUEST', now });
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
  await ensureReconciliation(tx, binding, {
    phoneE164: input.phoneE164,
    leadId: input.leadId,
    now,
  });
  if (await isLeadPhoneSuppressed(tx, binding.organizationId, input.leadId)) {
    throw new RequestAbort('LEAD_NOT_BOOKABLE');
  }
}

export async function requestBooking(
  deps: SchedulingEventDeps,
  scope: SchedulingAgentScope,
  args: RequestBookingArguments,
): Promise<RequestBookingResult> {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return refused(resolved.refusal);
  if (!resolved.scheduling) return refused(resolved.unavailable ?? 'SCHEDULING_UNAVAILABLE');
  const { binding, scheduling } = resolved;
  const timezone = await calendarTimezone(deps.db, {
    organizationId: binding.organizationId,
    calendarId: scheduling.calendarId,
  });
  if (!timezone) return refused('SCHEDULING_UNAVAILABLE');
  try {
    return await deps.db.transaction(async (tx) => {
      // L primeiro: a FK da intenção trava o lead (`KEY SHARE`); sem isso, o opt-out
      // concorrente (L → A → S) entraria em impasse com este caminho (A → S → I).
      await lockLead(tx, binding.organizationId, scheduling.leadId);
      const locked = await lockProtocol(tx, binding);
      if (!locked) return refused('CONTEXT_REFUSED');
      const now = deps.clock();
      const chosen = chosenOffer(locked, args, now);
      if ('refusal' in chosen) return refused(chosen.refusal);
      const phoneE164 = resolved.destinationPhoneE164;
      await recordIntent(tx, chosen.offer, {
        binding,
        leadId: scheduling.leadId,
        phoneE164,
        args,
        now,
      });
      const label = renderSlotLabel(chosen.offer.startsAt, timezone);
      const { listRevision, option } = args;
      return {
        status: 'PENDING_CONFIRMATION',
        listRevision,
        option,
        speech: renderBookingPendingSpeech(label),
      };
    });
  } catch (error) {
    if (error instanceof RequestAbort) return refused(error.refusal);
    throw error;
  }
}
