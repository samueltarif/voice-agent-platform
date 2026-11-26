import { createHash } from 'node:crypto';
import type {
  BookingAuthorization,
  ConfirmOfferResult,
  SchedulingAgentScope,
  SchedulingRefusal,
} from '@voice-agent/contracts';
import type { SchedulingProtocolStateEntity } from '../schema/scheduling-protocol-states.js';
import type { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import type { BookMeetingOutcome } from './meeting-booking-steps.js';
import {
  ProtocolAbort,
  protocolBookingHooks,
  type BookingTrack,
} from './scheduling-agent-booking-hooks.js';
import {
  notBookedResult,
  refusedResult,
  UNKNOWN_RESULT,
  verifiedBooking,
} from './scheduling-agent-booking-verify.js';
import type { SchedulingEventDeps } from './scheduling-agent-events.js';
import { readProtocolRow, resolveAgentScope } from './scheduling-agent-scope.js';
import {
  applyProtocolEvent,
  lockProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';

/**
 * E2 PR 2 (DEC-075, A4/A5) — `scheduling.confirm_offer`. Não recebe nada do
 * modelo: executa a autorização de uso único que o PROTOCOLO emitiu depois da
 * releitura entregue e do aceite elegível. Chave de idempotência derivada da
 * autorização: repetição técnica recupera a mesma reunião; resultado
 * desconhecido nunca é anunciado e a próxima chamada reconcilia sob as travas.
 */

export interface BookingDeps extends SchedulingEventDeps {
  readonly bookings: DrizzleMeetingBookingService;
  /** Pontos observáveis para testes (barreiras e falha depois do commit). */
  readonly testHooks?:
    | {
        readonly beforeSessionLock?: (() => Promise<void>) | undefined;
        readonly afterCommit?: (() => Promise<void>) | undefined;
      }
    | undefined;
}

interface BookingContext {
  readonly binding: SchedulingBinding;
  readonly leadId: string;
  readonly authorization: BookingAuthorization;
}

export function bookingKeyOf(binding: SchedulingBinding, authorization: BookingAuthorization) {
  const parts = [binding.organizationId, binding.sessionId, authorization.authorizationId];
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `agent-booking:${digest.slice(0, 48)}`;
}

/** Depois de qualquer não-reserva: encerra (sessão inativa) ou descarta autorização vencida. */
async function refresh(deps: BookingDeps, binding: SchedulingBinding): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const locked = await lockProtocol(tx, binding);
    if (!locked || locked.row.state.phase === 'CLOSED') return;
    const body = locked.active ? { type: 'CLOCK' as const } : { type: 'SESSION_CLOSED' as const };
    await applyProtocolEvent(tx, locked, { body, now: deps.clock() });
  });
}

type Attempt =
  | { readonly kind: 'OUTCOME'; readonly outcome: BookMeetingOutcome }
  | { readonly kind: 'DONE'; readonly result: ConfirmOfferResult };

async function attemptBooking(deps: BookingDeps, ctx: BookingContext): Promise<Attempt> {
  const { binding, authorization } = ctx;
  const track: BookingTrack = { locked: null, consumed: false, finished: false };
  const hooks = protocolBookingHooks({
    binding,
    authorization,
    clock: deps.clock,
    track,
    beforeSessionLock: deps.testHooks?.beforeSessionLock,
  });
  try {
    const outcome = await deps.bookings.bookOfferedSlot(
      {
        organizationId: binding.organizationId,
        offerId: authorization.offerId,
        sourceAttemptId: binding.attemptId,
        idempotencyKey: bookingKeyOf(binding, authorization),
        actor: { type: 'AGENT', id: binding.agentId },
      },
      hooks,
    );
    await deps.testHooks?.afterCommit?.();
    return { kind: 'OUTCOME', outcome };
  } catch (error) {
    if (!(error instanceof ProtocolAbort)) {
      // Depois do fim da transação de negócio, o COMMIT pode ter ocorrido.
      const result = track.finished ? UNKNOWN_RESULT : notBookedResult('TECHNICAL_FAILURE');
      return { kind: 'DONE', result };
    }
    await refresh(deps, binding);
    return { kind: 'DONE', result: refusedResult(error.refusal) };
  }
}

async function book(deps: BookingDeps, ctx: BookingContext): Promise<ConfirmOfferResult> {
  const attempt = await attemptBooking(deps, ctx);
  if (attempt.kind === 'DONE') return attempt.result;
  const { outcome } = attempt;
  const recovered = outcome.kind === 'REPLAYED';
  const verified = await verifiedBooking(deps.db, {
    binding: ctx.binding,
    leadId: ctx.leadId,
    offerId: ctx.authorization.offerId,
    recovered,
  });
  if (verified) return verified;
  if (outcome.kind === 'BOOKED' || recovered) return UNKNOWN_RESULT;
  await refresh(deps, ctx.binding);
  return notBookedResult(outcome.kind);
}

/** Leitura pontual do estado: o que NÃO pode virar reserva nova. */
function preBookingRefusal(row: SchedulingProtocolStateEntity): SchedulingRefusal | null {
  const { phase, authorization } = row.state;
  if (phase === 'OPTED_OUT' || row.optOutRecordedAt) return 'OPT_OUT_REQUESTED';
  if (row.optOutPending) return 'OPT_OUT_CLARIFICATION_PENDING';
  if (phase === 'CLOSED') return 'SESSION_NOT_ACTIVE';
  return phase === 'AUTHORIZED' && authorization ? null : 'NOT_AUTHORIZED';
}

/** Recuperação de reunião JÁ reservada (nunca uma nova operação). */
async function recoverBooked(
  deps: BookingDeps,
  input: { binding: SchedulingBinding; leadId: string; row: SchedulingProtocolStateEntity },
): Promise<ConfirmOfferResult> {
  const offerId = input.row.state.authorization?.offerId ?? '';
  const verify = { binding: input.binding, leadId: input.leadId, offerId, recovered: true };
  return (await verifiedBooking(deps.db, verify)) ?? UNKNOWN_RESULT;
}

export async function confirmOffer(
  deps: BookingDeps,
  scope: SchedulingAgentScope,
): Promise<ConfirmOfferResult> {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return refusedResult(resolved.refusal);
  if (!resolved.scheduling) return refusedResult(resolved.unavailable ?? 'SCHEDULING_UNAVAILABLE');
  const binding = resolved.binding;
  const leadId = resolved.scheduling.leadId;
  const row = await readProtocolRow(deps.db, binding);
  if (!row) return refusedResult('NOT_AUTHORIZED');
  if (row.state.phase === 'BOOKED') return recoverBooked(deps, { binding, leadId, row });
  const refusal = preBookingRefusal(row);
  if (refusal) return refusedResult(refusal);
  return book(deps, { binding, leadId, authorization: row.state.authorization! });
}
