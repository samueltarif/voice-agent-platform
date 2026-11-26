import {
  MAX_CLARIFICATIONS,
  type BookingProtocolEvent,
  type BookingProtocolState,
  type BookingProtocolStep,
} from './booking-protocol-types.js';
import type { LeadReplyIntent } from './lead-reply-intent.js';

/** E2 PR 1 (DEC-075) — respostas finais do interlocutor, exceto opt-out (tratado antes). */

type Utterance = Extract<BookingProtocolEvent, { type: 'LEAD_FINAL_UTTERANCE' }>;

export const ignoreStep = (
  state: BookingProtocolState,
  ignored: NonNullable<BookingProtocolStep['ignored']>,
): BookingProtocolStep => ({ state, directives: [], ignored });

/** Volta ao início: lista, seleção, releitura e autorização (não consumida) descartadas. */
export function resetToNewList(state: BookingProtocolState): BookingProtocolStep {
  return {
    state: {
      ...state,
      phase: 'IDLE',
      list: null,
      presentation: null,
      selection: null,
      readback: null,
      authorization: null,
      clarifications: 0,
    },
    directives: [{ kind: 'REQUEST_NEW_LIST' }],
  };
}

function clarify(state: BookingProtocolState): BookingProtocolStep {
  const clarifications = state.clarifications + 1;
  if (clarifications > MAX_CLARIFICATIONS) return resetToNewList(state);
  return { state: { ...state, clarifications }, directives: [{ kind: 'ASK_CLARIFICATION' }] };
}

function select(state: BookingProtocolState, ordinal: number): BookingProtocolStep {
  const offer = state.list?.offers[ordinal - 1];
  if (!offer || !state.list) return clarify(state);
  return {
    state: {
      ...state,
      phase: 'READBACK_PENDING',
      selection: { offerId: offer.offerId, ordinal },
      readback: null,
      clarifications: 0,
    },
    directives: [{ kind: 'READ_BACK', offerId: offer.offerId, listRevision: state.list.revision }],
  };
}

const expired = (state: BookingProtocolState, offerId: string, at: string): boolean => {
  const offer = state.list?.offers.find((candidate) => candidate.offerId === offerId);
  return !offer || Date.parse(offer.expiresAt) <= Date.parse(at);
};

function onSelectionReply(
  state: BookingProtocolState,
  intent: LeadReplyIntent,
): BookingProtocolStep {
  switch (intent.kind) {
    case 'SELECT':
      return select(state, intent.ordinal);
    case 'AFFIRM': // "sim" só escolhe quando há UMA opção; ainda exige releitura e confirmação
      return state.list?.offers.length === 1 ? select(state, 1) : clarify(state);
    case 'NEGATE':
    case 'TIME_CHANGE':
      return resetToNewList(state);
    default:
      return clarify(state);
  }
}

function authorize(state: BookingProtocolState, event: Utterance): BookingProtocolStep {
  const selection = state.selection!;
  if (expired(state, selection.offerId, event.at)) return resetToNewList(state);
  const revision = state.list!.revision;
  const authorization = {
    authorizationId: `auth:${revision}:${selection.offerId}:${event.seq}`,
    offerId: selection.offerId,
    listRevision: revision,
    utteranceSeq: event.seq,
    consumed: false,
  };
  return {
    state: { ...state, phase: 'AUTHORIZED', authorization, clarifications: 0 },
    directives: [{ kind: 'BOOK', authorization }],
  };
}

function onConfirmationReply(state: BookingProtocolState, event: Utterance): BookingProtocolStep {
  switch (event.intent.kind) {
    case 'AFFIRM':
      return authorize(state, event);
    case 'SELECT':
      return select(state, event.intent.ordinal);
    case 'NEGATE':
      return {
        state: { ...state, phase: 'AWAITING_SELECTION', selection: null, readback: null },
        directives: [{ kind: 'ASK_CLARIFICATION' }],
      };
    case 'TIME_CHANGE':
      return resetToNewList(state);
    default:
      return clarify(state);
  }
}

/** Depois de autorizado (ainda não consumido), só recusa ou troca de horário mudam algo. */
function onAuthorizedReply(state: BookingProtocolState, event: Utterance): BookingProtocolStep {
  const kind = event.intent.kind;
  if (event.startedSeq <= state.authorization!.utteranceSeq) {
    return ignoreStep(state, 'UTTERANCE_BEFORE_DELIVERY');
  }
  return kind === 'NEGATE' || kind === 'TIME_CHANGE' || kind === 'SELECT'
    ? resetToNewList(state)
    : ignoreStep(state, 'UNEXPECTED_IN_PHASE');
}

/** Momento de entrega que a resposta precisa suceder, por fase. */
function deliveredSeqFor(state: BookingProtocolState): number | null {
  if (state.phase === 'AWAITING_SELECTION') return state.presentation?.deliveredSeq ?? null;
  if (state.phase === 'AWAITING_CONFIRMATION') return state.readback?.deliveredSeq ?? null;
  return null;
}

export function onLeadReply(state: BookingProtocolState, event: Utterance): BookingProtocolStep {
  if (state.phase === 'AUTHORIZED') return onAuthorizedReply(state, event);
  const delivered = deliveredSeqFor(state);
  if (delivered === null) {
    const speaking = ['PRESENTING', 'READBACK_PENDING', 'READBACK_SPEAKING'].includes(state.phase);
    return ignoreStep(state, speaking ? 'UTTERANCE_BEFORE_DELIVERY' : 'UNEXPECTED_IN_PHASE');
  }
  // Associação temporal: só vale resposta que COMEÇOU depois da entrega completa.
  if (event.startedSeq <= delivered) return ignoreStep(state, 'UTTERANCE_BEFORE_DELIVERY');
  return state.phase === 'AWAITING_SELECTION'
    ? onSelectionReply(state, event.intent)
    : onConfirmationReply(state, event);
}
