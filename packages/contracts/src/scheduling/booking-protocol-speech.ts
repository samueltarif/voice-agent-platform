import { ignoreStep } from './booking-protocol-replies.js';
import type {
  BookingProtocolEvent,
  BookingProtocolState,
  BookingProtocolStep,
} from './booking-protocol-types.js';

/**
 * E2 PR 1 (DEC-075) — fala transacional: apresentação e releitura só contam
 * com o evento EXPLÍCITO de entrega completa da geração vigente (ajuste A1:
 * chamar `speak` não prova entrega). Geração antiga ou de outra lista é
 * ignorada; interrupção exige falar de novo, por inteiro.
 */

type Of<T extends BookingProtocolEvent['type']> = Extract<BookingProtocolEvent, { type: T }>;

const startsPresentation = (state: BookingProtocolState, event: Of<'SPEECH_STARTED'>) =>
  event.purpose === 'PRESENTATION' && state.phase === 'PRESENTING';

/** A releitura precisa ser da oferta EXATA selecionada, na lista vigente. */
const startsReadback = (state: BookingProtocolState, event: Of<'SPEECH_STARTED'>) =>
  event.purpose === 'READBACK' &&
  state.phase === 'READBACK_PENDING' &&
  state.selection !== null &&
  event.offerId === state.selection.offerId;

export function onSpeechStarted(
  state: BookingProtocolState,
  event: Of<'SPEECH_STARTED'>,
): BookingProtocolStep {
  if (event.listRevision !== state.list?.revision) return ignoreStep(state, 'STALE_LIST');
  const generation = { generationId: event.generationId, deliveredSeq: null };
  if (startsPresentation(state, event)) {
    return { state: { ...state, presentation: generation }, directives: [] };
  }
  if (startsReadback(state, event)) {
    const readback = { ...generation, offerId: state.selection!.offerId };
    return { state: { ...state, phase: 'READBACK_SPEAKING', readback }, directives: [] };
  }
  return ignoreStep(state, 'UNEXPECTED_IN_PHASE');
}

export function onSpeechCompleted(
  state: BookingProtocolState,
  event: Of<'SPEECH_COMPLETED'>,
): BookingProtocolStep {
  const { generationId, seq } = event;
  if (state.phase === 'PRESENTING' && state.presentation?.generationId === generationId) {
    const presentation = { generationId, deliveredSeq: seq };
    return { state: { ...state, phase: 'AWAITING_SELECTION', presentation }, directives: [] };
  }
  if (state.phase === 'READBACK_SPEAKING' && state.readback?.generationId === generationId) {
    const readback = { ...state.readback, deliveredSeq: seq };
    return { state: { ...state, phase: 'AWAITING_CONFIRMATION', readback }, directives: [] };
  }
  return ignoreStep(state, 'STALE_GENERATION');
}

const interruptsPresentation = (state: BookingProtocolState, generationId: string) =>
  state.phase === 'PRESENTING' && state.presentation?.generationId === generationId;
const interruptsReadback = (state: BookingProtocolState, generationId: string) =>
  state.phase === 'READBACK_SPEAKING' && state.readback?.generationId === generationId;

export function onSpeechInterrupted(
  state: BookingProtocolState,
  event: Of<'SPEECH_INTERRUPTED'>,
): BookingProtocolStep {
  const revision = state.list?.revision ?? 0;
  if (interruptsPresentation(state, event.generationId)) {
    return {
      state: { ...state, presentation: null },
      directives: [{ kind: 'PRESENT_LIST', listRevision: revision }],
    };
  }
  if (interruptsReadback(state, event.generationId)) {
    const offerId = state.selection!.offerId;
    return {
      state: { ...state, phase: 'READBACK_PENDING', readback: null },
      directives: [{ kind: 'READ_BACK', offerId, listRevision: revision }],
    };
  }
  return ignoreStep(state, 'STALE_GENERATION');
}
