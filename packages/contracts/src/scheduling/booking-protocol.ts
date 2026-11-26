import { ignoreStep, onLeadReply, resetToNewList } from './booking-protocol-replies.js';
import {
  onSpeechCompleted,
  onSpeechInterrupted,
  onSpeechStarted,
} from './booking-protocol-speech.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  MAX_OFFERS_PER_LIST,
  type BookingProtocolEvent,
  type BookingProtocolState,
  type BookingProtocolStep,
  type ProtocolOfferList,
} from './booking-protocol-types.js';

/**
 * E2 PR 1 (DEC-075) — redutor PURO do protocolo de agendamento. Determinístico:
 * mesmo estado + mesmo evento ⇒ mesmo resultado. Não toca banco nem relógio;
 * o instante vem do evento (`at`, atribuído pelo servidor).
 *
 * Precedência: (1) evento repetido/fora de ordem é ignorado; (2) opt-out
 * inequívoco vale em QUALQUER fase não terminal, sem associação temporal;
 * (3) fases terminais ignoram o resto; (4) encerramento da sessão anula tudo.
 */

type Of<T extends BookingProtocolEvent['type']> = Extract<BookingProtocolEvent, { type: T }>;

const TERMINAL = new Set(['BOOKED', 'OPTED_OUT', 'CLOSED']);

const cleared = (state: BookingProtocolState, phase: 'OPTED_OUT' | 'CLOSED') => ({
  ...state,
  phase,
  list: null,
  presentation: null,
  selection: null,
  readback: null,
  authorization: null,
});

function validList(list: ProtocolOfferList): boolean {
  const ids = new Set(list.offers.map((offer) => offer.offerId));
  const count = list.offers.length;
  return count >= 1 && count <= MAX_OFFERS_PER_LIST && ids.size === count && list.revision > 0;
}

function onList(state: BookingProtocolState, event: Of<'OFFER_LIST_ISSUED'>): BookingProtocolStep {
  if (state.phase === 'BOOKING') return ignoreStep(state, 'BOOKING_IN_FLIGHT');
  const { revision, queryKey } = event.list;
  if (revision <= state.maxRevision) {
    // Retry técnico só recupera a lista AINDA vigente; nada é renovado (ids, ordem, TTL).
    const current = state.list;
    const retry = current?.revision === revision && current.queryKey === queryKey;
    return ignoreStep(state, retry ? 'RETRY_SAME_LIST' : 'STALE_LIST');
  }
  if (!validList(event.list)) return ignoreStep(state, 'STALE_LIST');
  return {
    state: {
      ...state,
      phase: 'PRESENTING',
      list: event.list,
      maxRevision: revision,
      presentation: null,
      selection: null,
      readback: null,
      authorization: null,
      clarifications: 0,
    },
    directives: [{ kind: 'PRESENT_LIST', listRevision: event.list.revision }],
  };
}

function offerExpiredAt(state: BookingProtocolState, at: string): boolean {
  const offerId = state.authorization?.offerId ?? state.selection?.offerId;
  const offers = state.list?.offers ?? [];
  const relevant = offerId ? offers.filter((offer) => offer.offerId === offerId) : offers;
  return (
    relevant.length > 0 && relevant.every((offer) => Date.parse(offer.expiresAt) <= Date.parse(at))
  );
}

/** A4 — uso único: a autorização só é consumida uma vez e antes de vencer. */
function onConsumed(
  state: BookingProtocolState,
  event: Of<'AUTHORIZATION_CONSUMED'>,
): BookingProtocolStep {
  const authorization = state.authorization;
  if (state.phase !== 'AUTHORIZED' || authorization?.authorizationId !== event.authorizationId) {
    return ignoreStep(state, 'AUTHORIZATION_MISMATCH');
  }
  if (offerExpiredAt(state, event.at)) return resetToNewList(state);
  return {
    state: { ...state, phase: 'BOOKING', authorization: { ...authorization, consumed: true } },
    directives: [],
  };
}

/** A5 — sucesso só com resultado canônico E reunião conferida para a MESMA oferta. */
function onBookingResult(
  state: BookingProtocolState,
  event: Of<'BOOKING_RESULT'>,
): BookingProtocolStep {
  const authorization = state.authorization;
  if (state.phase !== 'BOOKING' || authorization?.authorizationId !== event.authorizationId) {
    return ignoreStep(state, 'AUTHORIZATION_MISMATCH');
  }
  const meeting = event.verifiedMeeting;
  const canonical = event.outcome === 'BOOKED' || event.outcome === 'REPLAYED';
  if (canonical && meeting && meeting.offerId === authorization.offerId) {
    return {
      state: { ...state, phase: 'BOOKED', meetingId: meeting.meetingId },
      directives: [{ kind: 'ANNOUNCE_BOOKED', meetingId: meeting.meetingId }],
    };
  }
  const reset = resetToNewList(state);
  return {
    ...reset,
    directives: [{ kind: 'ANNOUNCE_NOT_BOOKED', outcome: event.outcome }, ...reset.directives],
  };
}

function onClock(state: BookingProtocolState, event: Of<'CLOCK'>): BookingProtocolStep {
  const live = state.phase !== 'IDLE' && state.phase !== 'BOOKING';
  return live && offerExpiredAt(state, event.at)
    ? resetToNewList(state)
    : { state, directives: [] };
}

type Handler = (state: BookingProtocolState, event: never) => BookingProtocolStep;

const HANDLERS: Readonly<Record<BookingProtocolEvent['type'], Handler>> = {
  OFFER_LIST_ISSUED: onList,
  SPEECH_STARTED: onSpeechStarted,
  SPEECH_COMPLETED: onSpeechCompleted,
  SPEECH_INTERRUPTED: onSpeechInterrupted,
  LEAD_FINAL_UTTERANCE: onLeadReply,
  AUTHORIZATION_CONSUMED: onConsumed,
  BOOKING_RESULT: onBookingResult,
  CLOCK: onClock,
  SESSION_CLOSED: (state) => ({ state: cleared(state, 'CLOSED'), directives: [] }),
};

function dispatch(state: BookingProtocolState, event: BookingProtocolEvent): BookingProtocolStep {
  return HANDLERS[event.type](state, event as never);
}

const isOptOut = (event: BookingProtocolEvent) =>
  event.type === 'LEAD_FINAL_UTTERANCE' && event.intent.kind === 'OPT_OUT';

/**
 * Ordem de precedência: (1) repetição/fora de ordem; (2) encerramento da
 * sessão — processado ANTES do filtro de terminais, preservando reunião e
 * evidência de opt-out anteriores (A3); (3) fases terminais (em `CLOSED`
 * nada novo é aceito, nem opt-out); (4) opt-out; (5) o resto.
 */
export function advanceBookingProtocol(
  previous: BookingProtocolState,
  event: BookingProtocolEvent,
): BookingProtocolStep {
  if (event.seq <= previous.lastSeq) return ignoreStep(previous, 'DUPLICATE_OR_OUT_OF_ORDER');
  const state = { ...previous, lastSeq: event.seq };
  if (event.type === 'SESSION_CLOSED' && state.phase !== 'CLOSED') {
    return { state: cleared(state, 'CLOSED'), directives: [] };
  }
  if (TERMINAL.has(state.phase) && !(isOptOut(event) && state.phase === 'BOOKED')) {
    return ignoreStep(state, 'TERMINAL_PHASE');
  }
  if (isOptOut(event)) {
    // Opt-out prevalece; uma reunião já reservada é preservada (E1), a fala de sucesso não.
    return {
      state: { ...cleared(state, 'OPTED_OUT'), optOutSeq: event.seq },
      directives: [{ kind: 'RECORD_OPT_OUT' }],
    };
  }
  return dispatch(state, event);
}

export { INITIAL_BOOKING_PROTOCOL_STATE };
