import {
  renderBookedSpeech,
  renderOfferListSpeech,
  renderReadbackSpeech,
  renderRefusalSpeech,
  renderSlotLabel,
  SCHEDULING_SPEECH,
  type BookingProtocolDirective,
  type BookingProtocolState,
  type BookingProtocolStep,
  type SchedulingProtocolView,
  type SchedulingRefusal,
} from '@voice-agent/contracts';
import type { SchedulingProtocolStateEntity } from '../schema/scheduling-protocol-states.js';

/**
 * E2 PR 2 (DEC-075) — visão do protocolo para o harness: fase, diretivas e a
 * fala DETERMINÍSTICA de cada diretiva, renderizada das ofertas registradas.
 */

function labelOf(state: BookingProtocolState, offerId: string, timezone: string): string | null {
  const offer = state.list?.offers.find((candidate) => candidate.offerId === offerId);
  return offer ? renderSlotLabel(offer.startsAt, timezone) : null;
}

function listSpeech(state: BookingProtocolState, timezone: string): string | null {
  const offers = state.list?.offers ?? [];
  if (offers.length === 0) return null;
  return renderOfferListSpeech(offers.map((offer) => renderSlotLabel(offer.startsAt, timezone)));
}

interface SpeechInput {
  readonly state: BookingProtocolState;
  readonly timezone: string | null;
  readonly optOutPending: boolean;
}

type Kind = BookingProtocolDirective['kind'];
type SpeechRule = (directive: never, input: SpeechInput) => string | null;

function readBack(directive: { readonly offerId: string }, input: SpeechInput): string | null {
  const label = input.timezone ? labelOf(input.state, directive.offerId, input.timezone) : null;
  return label ? renderReadbackSpeech(label) : null;
}

function announceBooked(_directive: unknown, input: SpeechInput): string | null {
  const offerId = input.state.authorization?.offerId;
  const label = input.timezone && offerId ? labelOf(input.state, offerId, input.timezone) : null;
  return label ? renderBookedSpeech(label) : null;
}

const SPEECH_RULES: Readonly<Record<Kind, SpeechRule>> = {
  PRESENT_LIST: (_d, input) => (input.timezone ? listSpeech(input.state, input.timezone) : null),
  READ_BACK: readBack,
  ASK_CLARIFICATION: (_d, input) =>
    input.optOutPending ? SCHEDULING_SPEECH.OPT_OUT_CLARIFICATION : SCHEDULING_SPEECH.CLARIFY,
  REQUEST_NEW_LIST: () => null,
  RECORD_OPT_OUT: () => renderRefusalSpeech('OPT_OUT_REQUESTED'),
  BOOK: () => null,
  ANNOUNCE_BOOKED: announceBooked,
  ANNOUNCE_NOT_BOOKED: () => SCHEDULING_SPEECH.NOT_BOOKED,
};

function speechFor(directive: BookingProtocolDirective, input: SpeechInput): string | null {
  return SPEECH_RULES[directive.kind](directive as never, input);
}

export function protocolView(input: {
  readonly step: BookingProtocolStep;
  readonly row: SchedulingProtocolStateEntity;
  readonly timezone: string | null;
  readonly refusal?: SchedulingRefusal | null | undefined;
}): SchedulingProtocolView {
  const speechInput = {
    state: input.step.state,
    timezone: input.timezone,
    optOutPending: input.row.optOutPending,
  };
  const spoken = input.step.directives
    .map((directive) => speechFor(directive, speechInput))
    .filter((text): text is string => text !== null);
  const refusalSpeech = input.refusal ? renderRefusalSpeech(input.refusal) : null;
  return {
    phase: input.step.state.phase,
    directives: input.step.directives,
    speech: spoken.length > 0 ? spoken.join(' ') : refusalSpeech,
    ignored: input.step.ignored ?? null,
    optOutClarificationPending: input.row.optOutPending,
    refusal: input.refusal ?? null,
  };
}

/** Visão sem evento novo (recusa antes de qualquer mudança). */
export function unchangedView(
  row: SchedulingProtocolStateEntity,
  refusal: SchedulingRefusal,
): SchedulingProtocolView {
  return protocolView({ step: { state: row.state, directives: [] }, row, timezone: null, refusal });
}
