import { createHash } from 'node:crypto';
import {
  renderOfferListSpeech,
  renderRefusalSpeech,
  renderSlotLabel,
  zonedBoundaryInstant,
  type FindSlotsArguments,
  type FindSlotsResult,
  type ProtocolOfferList,
  type SchedulingRefusal,
} from '@voice-agent/contracts';
import { isLeadPhoneSuppressed } from './attempt-lead-association.js';
import type { DatabaseExecutor } from './database-executor.js';
import { commercialBlock } from './scheduling-agent-scope.js';
import { applyProtocolEvent, type LockedProtocol } from './scheduling-protocol-store.js';
import type { OfferSlotsOutcome } from './scheduling-slot-repository.js';

/** E2 (DEC-075 D3; DEC-077) — passos puros e travados da oferta (`scheduling.find_slots`). */

const DAY_MS = 86_400_000;
const SEARCH_DAYS = 7;
/** Na conexão direta a lista vigente fica em `PRESENTING` (não há eventos de fala). */
const LIVE_PHASES = new Set(['PRESENTING']);

export const refused = (reason: SchedulingRefusal): FindSlotsResult => ({
  status: 'REFUSED',
  reason,
  speech: renderRefusalSpeech(reason),
});

export function queryKeyOf(calendarId: string, args: FindSlotsArguments): string {
  const parts = JSON.stringify([calendarId, args.day ?? `next-${SEARCH_DAYS}-days`]);
  return createHash('sha256').update(parts).digest('hex').slice(0, 32);
}

export function windowOf(args: FindSlotsArguments, timezone: string, now: Date) {
  if (!args.day) return { from: now, to: new Date(now.getTime() + SEARCH_DAYS * DAY_MS) };
  return {
    from: zonedBoundaryInstant(args.day, 0, timezone),
    to: zonedBoundaryInstant(args.day, 1440, timezone),
  };
}

/** Retry técnico: lista vigente da MESMA consulta, ainda não vencida — mesmos ids, ordem e prazo. */
function liveListFor(
  locked: LockedProtocol,
  queryKey: string,
  now: Date,
): ProtocolOfferList | null {
  const { state } = locked.row;
  const list = state.list;
  if (!list || list.queryKey !== queryKey || !LIVE_PHASES.has(state.phase)) return null;
  return list.offers.some((offer) => Date.parse(offer.expiresAt) > now.getTime()) ? list : null;
}

export function offered(
  list: ProtocolOfferList,
  timezone: string,
  retry: boolean,
): FindSlotsResult {
  const labels = list.offers.map((offer) => renderSlotLabel(offer.startsAt, timezone));
  return {
    status: 'OFFERED',
    listRevision: list.revision,
    retry,
    options: labels.map((label, index) => ({ ordinal: index + 1, label })),
    speech: renderOfferListSpeech(labels),
  };
}

type Gate = { readonly done: FindSlotsResult } | { readonly done: null };

export async function gate(
  tx: DatabaseExecutor,
  locked: LockedProtocol | null,
  input: GateInput,
): Promise<Gate> {
  if (!locked) return { done: refused('CONTEXT_REFUSED') };
  if (!locked.active && locked.row.state.phase !== 'CLOSED') {
    await applyProtocolEvent(tx, locked, { body: { type: 'SESSION_CLOSED' }, now: input.now });
  }
  const block = commercialBlock(locked);
  if (block) return { done: refused(block) };
  const live = liveListFor(locked, input.queryKey, input.now);
  if (!live) return { done: null };
  // A5: lista em cache só volta se a supressão canônica ainda permitir (P depois de S).
  if (await isLeadPhoneSuppressed(tx, locked.row.organizationId, input.leadId)) {
    await voidLists(tx, locked, input.now);
    return { done: refused('LEAD_NOT_BOOKABLE') };
  }
  return { done: offered(live, input.timezone, true) };
}

/**
 * A5: consulta nova sem vagas (ou recusada) descarta, sob a trava S, a lista,
 * a seleção e a autorização anteriores, consumindo uma revisão.
 */
export async function voidLists(tx: DatabaseExecutor, locked: LockedProtocol, now: Date) {
  const revision = locked.row.state.maxRevision + 1;
  const queryKey = `void-${revision}`;
  return applyProtocolEvent(tx, locked, { body: { type: 'QUERY_EMPTY', revision, queryKey }, now });
}

export interface GateInput {
  readonly queryKey: string;
  readonly timezone: string;
  readonly leadId: string;
  readonly now: Date;
}

export const OFFER_REFUSAL: Readonly<
  Record<Exclude<OfferSlotsOutcome['kind'], 'OFFERED'>, SchedulingRefusal>
> = {
  CALENDAR_NOT_FOUND: 'SCHEDULING_UNAVAILABLE',
  LEAD_NOT_FOUND: 'CONTEXT_REFUSED',
  LEAD_NOT_BOOKABLE: 'LEAD_NOT_BOOKABLE',
  LEAD_SUPPRESSED: 'LEAD_NOT_BOOKABLE',
  ATTEMPT_NOT_FOUND: 'CONTEXT_REFUSED',
  ATTEMPT_LEAD_MISMATCH: 'CONTEXT_REFUSED',
};
