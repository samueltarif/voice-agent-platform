import { ignoreStep } from './booking-protocol-replies.js';
import {
  MAX_OFFERS_PER_LIST,
  type BookingProtocolEvent,
  type BookingProtocolState,
  type BookingProtocolStep,
  type ProtocolOfferList,
} from './booking-protocol-types.js';

/**
 * E2 (DEC-075) — listas e intervenções no protocolo PURO:
 * - `OFFER_LIST_ISSUED` (PR 1): revisão nova substitui a anterior; retry técnico
 *   só recupera a lista ainda vigente, sem renovar nada.
 * - `QUERY_EMPTY` (auditoria consolidada A5): consulta NOVA sem vagas descarta a
 *   lista, a seleção e a autorização anteriores; a revisão é consumida.
 */

type Of<T extends BookingProtocolEvent['type']> = Extract<BookingProtocolEvent, { type: T }>;

function validList(list: ProtocolOfferList): boolean {
  const ids = new Set(list.offers.map((offer) => offer.offerId));
  const count = list.offers.length;
  return count >= 1 && count <= MAX_OFFERS_PER_LIST && ids.size === count && list.revision > 0;
}

const discarded = {
  presentation: null,
  selection: null,
  readback: null,
  authorization: null,
  clarifications: 0,
} as const;

export function onList(
  state: BookingProtocolState,
  event: Of<'OFFER_LIST_ISSUED'>,
): BookingProtocolStep {
  if (state.phase === 'BOOKING') return ignoreStep(state, 'BOOKING_IN_FLIGHT');
  const { revision, queryKey } = event.list;
  if (revision <= state.maxRevision) {
    const current = state.list;
    const retry = current?.revision === revision && current.queryKey === queryKey;
    return ignoreStep(state, retry ? 'RETRY_SAME_LIST' : 'STALE_LIST');
  }
  if (!validList(event.list)) return ignoreStep(state, 'STALE_LIST');
  return {
    state: { ...state, ...discarded, phase: 'PRESENTING', list: event.list, maxRevision: revision },
    directives: [{ kind: 'PRESENT_LIST', listRevision: event.list.revision }],
  };
}

export function onQueryEmpty(
  state: BookingProtocolState,
  event: Of<'QUERY_EMPTY'>,
): BookingProtocolStep {
  if (state.phase === 'BOOKING') return ignoreStep(state, 'BOOKING_IN_FLIGHT');
  if (event.revision <= state.maxRevision || event.revision < 1) {
    return ignoreStep(state, 'STALE_LIST');
  }
  return {
    state: { ...state, ...discarded, phase: 'IDLE', list: null, maxRevision: event.revision },
    directives: [],
  };
}
