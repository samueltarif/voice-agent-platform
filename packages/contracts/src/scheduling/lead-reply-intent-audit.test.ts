import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';

type EventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

const kind = (text: string) => classifyLeadReply(text).kind;

/** Leva o protocolo até AWAITING_CONFIRMATION (releitura entregue) e aplica uma resposta. */
function confirmWith(text: string) {
  let state: BookingProtocolState = INITIAL_BOOKING_PROTOCOL_STATE;
  let seq = 0;
  const directives: string[] = [];
  const send = (body: EventBody) => {
    const step = advanceBookingProtocol(state, {
      ...body,
      seq: ++seq,
      at: '2026-12-01T12:00:00.000Z',
    } as BookingProtocolEvent);
    state = step.state;
    directives.push(...step.directives.map((d) => d.kind));
    return step;
  };
  const offers = [1, 2].map((i) => ({
    offerId: `o${i}`,
    startsAt: '2026-12-02T12:00:00.000Z',
    endsAt: '2026-12-02T12:30:00.000Z',
    expiresAt: '2026-12-01T12:15:00.000Z',
  }));
  send({ type: 'OFFER_LIST_ISSUED', list: { revision: 1, queryKey: 'q', offers } });
  send({ type: 'SPEECH_STARTED', generationId: 'p', purpose: 'PRESENTATION', listRevision: 1 });
  send({ type: 'SPEECH_COMPLETED', generationId: 'p' });
  send({ type: 'LEAD_FINAL_UTTERANCE', startedSeq: ++seq, intent: { kind: 'SELECT', ordinal: 1 } });
  send({
    type: 'SPEECH_STARTED',
    generationId: 'r',
    purpose: 'READBACK',
    listRevision: 1,
    offerId: 'o1',
  });
  send({ type: 'SPEECH_COMPLETED', generationId: 'r' });
  directives.length = 0;
  send({ type: 'LEAD_FINAL_UTTERANCE', startedSeq: ++seq, intent: classifyLeadReply(text) });
  const authorization = state.authorization;
  if (authorization)
    send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: authorization.authorizationId });
  return { phase: state.phase, directives };
}

describe('E2 PR1 audit A1 — questions, quotations and conditions are never consent', () => {
  const NOT_CONSENT = [
    'Pode marcar?',
    'Sim?',
    'Pode confirmar?',
    'Ele disse que sim.',
    '“sim”',
    '"sim"',
    'Sim, mas não marque.',
    'Se meu sócio concordar, pode marcar.',
  ];

  it('classifies them as AMBIGUOUS (clarification), never AFFIRM', () => {
    expect(NOT_CONSENT.map(kind)).toEqual(NOT_CONSENT.map(() => 'AMBIGUOUS'));
  });

  it('none of them authorizes, books or reaches BOOKING in the full reducer flow', () => {
    for (const text of NOT_CONSENT) {
      const result = confirmWith(text);
      expect([text, result.phase, result.directives]).toEqual([
        text,
        'AWAITING_CONFIRMATION',
        ['ASK_CLARIFICATION'],
      ]);
    }
  });

  it('unequivocal acceptance, with ordinary punctuation, still authorizes exactly once', () => {
    for (const text of ['Sim', 'Sim!', 'Pode marcar.', 'Sim, pode marcar.', 'Isso mesmo!']) {
      expect([text, kind(text)]).toEqual([text, 'AFFIRM']);
      expect(confirmWith(text)).toEqual({ phase: 'BOOKING', directives: ['BOOK'] });
    }
  });
});

describe('E2 PR1 audit A2 — opt-out recognized per clause', () => {
  it('informational questions, denials and quotations are not opt-out', () => {
    expect(
      [
        'O que significa descadastrar?',
        'Eu não pedi para ser descadastrado.',
        'Hoje não posso.',
        'Ele falou “me descadastra”, mas eu não quero isso.',
        'O atendente disse "não me liguem mais" por engano.',
      ].map(kind),
    ).toEqual(['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS']);
  });

  it('an explicit request in its own clause wins over unrelated negations or other clauses', () => {
    expect(
      [
        'Não precisa confirmar a reunião, mas não me ligue mais.',
        'Não me ligue mais.',
        'Retire meu número da lista.',
        'Obrigado pela ligação. Por favor, me descadastre.',
        'Pode tirar meu número da lista?',
        'Vocês podem parar de me ligar?',
      ].map(kind),
    ).toEqual(Array(6).fill('OPT_OUT'));
  });

  it('a negated request inside the SAME clause stays ambiguous', () => {
    expect(kind('Não precisa tirar meu número.')).toBe('AMBIGUOUS');
  });

  it('the reducer records the opt-out only for real requests', () => {
    expect(
      confirmWith('Não precisa confirmar a reunião, mas não me ligue mais.').directives,
    ).toEqual(['RECORD_OPT_OUT']);
    expect(confirmWith('O que significa descadastrar?').directives).toEqual(['ASK_CLARIFICATION']);
  });
});
