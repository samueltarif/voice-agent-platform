import {
  MAX_OFFERS_PER_LIST,
  OFFER_TTL_MINUTES,
  SCHEDULING_SPEECH,
  type FindSlotsArguments,
  type FindSlotsResult,
  type ProtocolOfferList,
  type SchedulingAgentScope,
} from '@voice-agent/contracts';
import type { MeetingSlotOfferEntity } from '../schema/meeting-slot-offers.js';
import type { SchedulingEventDeps } from './scheduling-agent-deps.js';
import {
  gate,
  OFFER_REFUSAL,
  voidLists,
  offered,
  queryKeyOf,
  refused,
  windowOf,
  type GateInput,
} from './scheduling-agent-offer-steps.js';
import { ensureReconciliation } from './post-call-reconciliation-store.js';
import { calendarTimezone, resolveAgentScope } from './scheduling-agent-scope.js';
import {
  applyProtocolEvent,
  lockProtocol,
  type SchedulingBinding,
} from './scheduling-protocol-store.js';
import type { DrizzleSchedulingSlotRepository } from './scheduling-slot-repository.js';

/**
 * E2 (DEC-075 D3; DEC-077) — consulta e OFERTA (`scheduling.find_slots`).
 * Disponibilidade real da agenda FIXADA (E1 `offerSlots`, ordem L → C → A → P),
 * até 3 opções em ordem cronológica, validade de 15 min sem renovação.
 * A lista só passa a existir no protocolo numa segunda transação sob a trava
 * S (revisão nova; a anterior é descartada). Ofertas criadas cuja lista não
 * entra no protocolo nunca são apresentadas nem reservadas e apenas vencem.
 * Oferecer não reserva.
 */

export interface OfferDeps extends SchedulingEventDeps {
  readonly slots: DrizzleSchedulingSlotRepository;
}

/** Segunda transação (S): a lista entra no protocolo com revisão nova, se nada mudou. */
function issueList(
  deps: OfferDeps,
  input: {
    readonly binding: SchedulingBinding;
    readonly offers: readonly MeetingSlotOfferEntity[];
    readonly gate: Omit<GateInput, 'now'>;
  },
): Promise<FindSlotsResult> {
  return deps.db.transaction(async (tx) => {
    const locked = await lockProtocol(tx, input.binding);
    const post = await gate(tx, locked, { ...input.gate, now: deps.clock() });
    if (post.done) return post.done;
    const list: ProtocolOfferList = {
      revision: locked!.row.state.maxRevision + 1,
      queryKey: input.gate.queryKey,
      offers: [...input.offers]
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((offer) => ({
          offerId: offer.id,
          startsAt: offer.startsAt.toISOString(),
          endsAt: offer.endsAt.toISOString(),
          expiresAt: offer.expiresAt.toISOString(),
        })),
    };
    const applied = await applyProtocolEvent(tx, locked!, {
      body: { type: 'OFFER_LIST_ISSUED', list },
      now: deps.clock(),
    });
    if (applied.step.ignored) return refused('OFFER_NOT_CURRENT');
    return offered(list, input.gate.timezone, false);
  });
}

/**
 * A5: consulta NOVA sem vagas, ou recusada, nunca deixa valendo a lista e a
 * autorização anteriores — descartadas sob a trava S (o retry técnico da
 * MESMA consulta vigente continua devolvendo a lista, pelo `gate`).
 */
function voidPrevious(
  deps: OfferDeps,
  input: {
    readonly binding: SchedulingBinding;
    readonly gate: Omit<GateInput, 'now'>;
    readonly result: FindSlotsResult;
  },
): Promise<FindSlotsResult> {
  return deps.db.transaction(async (tx) => {
    const locked = await lockProtocol(tx, input.binding);
    const post = await gate(tx, locked, { ...input.gate, now: deps.clock() });
    if (post.done) return post.done;
    const applied = await voidLists(tx, locked!, deps.clock());
    return applied.step.ignored ? refused('OFFER_NOT_CURRENT') : input.result;
  });
}

/** 1ª transação (A → S → R): retry técnico, bloqueios e abertura da reconciliação. */
function preGate(
  deps: OfferDeps,
  input: {
    readonly binding: SchedulingBinding;
    readonly phoneE164: string;
    readonly gate: Omit<GateInput, 'now'>;
  },
) {
  const { binding, phoneE164 } = input;
  return deps.db.transaction(async (tx) => {
    const locked = await lockProtocol(tx, binding);
    // DEC-077: ferramenta usada ⇒ a sessão passa a exigir reconciliação pós-chamada.
    const leadId = input.gate.leadId;
    if (locked?.active)
      await ensureReconciliation(tx, binding, { phoneE164, leadId, now: deps.clock() });
    return gate(tx, locked, { ...input.gate, now: deps.clock() });
  });
}

export async function findSlots(
  deps: OfferDeps,
  scope: SchedulingAgentScope,
  args: FindSlotsArguments,
): Promise<FindSlotsResult> {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return refused(resolved.refusal);
  if (!resolved.scheduling) return refused(resolved.unavailable ?? 'SCHEDULING_UNAVAILABLE');
  const { binding, scheduling } = resolved;
  const organizationId = binding.organizationId;
  const timezone = await calendarTimezone(deps.db, {
    organizationId,
    calendarId: scheduling.calendarId,
  });
  if (!timezone) return refused('SCHEDULING_UNAVAILABLE');
  const queryKey = queryKeyOf(scheduling.calendarId, args);
  const leadId = scheduling.leadId;
  const phoneE164 = resolved.destinationPhoneE164;
  const pre = await preGate(deps, { binding, phoneE164, gate: { queryKey, timezone, leadId } });
  if (pre.done) return pre.done;
  const now = deps.clock();
  const outcome = await deps.slots.offerSlots({
    organizationId,
    calendarId: scheduling.calendarId,
    leadId: scheduling.leadId,
    sourceAttemptId: binding.attemptId,
    ...windowOf(args, timezone, now),
    limit: MAX_OFFERS_PER_LIST,
    now,
    ttlMinutes: OFFER_TTL_MINUTES,
  });
  const gateInput = { queryKey, timezone, leadId };
  if (outcome.kind !== 'OFFERED') {
    return voidPrevious(deps, {
      binding,
      gate: gateInput,
      result: refused(OFFER_REFUSAL[outcome.kind]),
    });
  }
  if (outcome.offers.length === 0) {
    const empty: FindSlotsResult = {
      status: 'NO_AVAILABILITY',
      speech: SCHEDULING_SPEECH.NO_AVAILABILITY,
    };
    return voidPrevious(deps, { binding, gate: gateInput, result: empty });
  }
  return issueList(deps, { binding, offers: outcome.offers, gate: gateInput });
}
