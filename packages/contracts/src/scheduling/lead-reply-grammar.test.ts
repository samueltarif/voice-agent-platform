import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';

/**
 * E2 PR 1 — 4ª auditoria (A1/A2): casos exatos, acentos com significado (I6)
 * e decisão pela fala inteira (I7). Expectativas por categoria, escritas à
 * mão, independentes do classificador; cada caso confere classificação e fluxo.
 */

type EventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

function flow(text: string) {
  let state: BookingProtocolState = INITIAL_BOOKING_PROTOCOL_STATE;
  let seq = 0;
  const directives: string[] = [];
  const send = (body: EventBody) => {
    const event = { ...body, seq: ++seq, at: '2026-12-01T12:00:00.000Z' } as BookingProtocolEvent;
    const step = advanceBookingProtocol(state, event);
    state = step.state;
    directives.push(...step.directives.map((d) => d.kind));
  };
  const offer = {
    offerId: 'o1',
    startsAt: '2026-12-02T12:00:00.000Z',
    endsAt: '2026-12-02T12:30:00.000Z',
    expiresAt: '2026-12-01T12:15:00.000Z',
  };
  send({
    type: 'OFFER_LIST_ISSUED',
    list: { revision: 1, queryKey: 'q', offers: [offer, { ...offer, offerId: 'o2' }] },
  });
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
  if (state.authorization)
    send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: state.authorization.authorizationId });
  return { phase: state.phase, directives: [...directives] };
}

type Expected = { kind: string; flow: { phase: string; directives: string[] } };
const CLARIFY: Expected = {
  kind: 'AMBIGUOUS',
  flow: { phase: 'AWAITING_CONFIRMATION', directives: ['ASK_CLARIFICATION'] },
};
const CONSENT: Expected = { kind: 'AFFIRM', flow: { phase: 'BOOKING', directives: ['BOOK'] } };
const OPT_OUT: Expected = {
  kind: 'OPT_OUT',
  flow: { phase: 'OPTED_OUT', directives: ['RECORD_OPT_OUT'] },
};

function expectAll(cases: readonly string[], expected: Expected) {
  for (const text of cases) {
    expect([text, classifyLeadReply(text).kind, flow(text)]).toEqual([
      text,
      expected.kind,
      expected.flow,
    ]);
  }
}

describe('fourth Codex audit — exact cases', () => {
  it('“Pôde marcar.” (past tense) is not consent', () => expectAll(['Pôde marcar.'], CLARIFY));
  it('a condition in its own sentence, after or before the request, is never ignored', () =>
    expectAll(
      [
        'Tire meu número da lista. Só se eu confirmar amanhã.',
        'Só se eu confirmar amanhã. Tire meu número da lista.',
      ],
      CLARIFY,
    ));
  it('reflexive “se” in independent courtesy does not cancel the request', () =>
    expectAll(['Não se preocupe, mas me descadastre.'], OPT_OUT));
});

describe('I6 — accents keep their meaning', () => {
  it('an added or substituted accent never matches an allowed form', () => {
    expectAll(
      ['Pôde marcar.', 'Pôde.', 'Pôde sim.', 'Pôde agendar.', 'Sím.', 'Cérto.', 'Tà bom.'],
      CLARIFY,
    );
    expectAll(['Não me ligue máis.', 'Tire meu número dá lista.', 'Me descadastrê.'], CLARIFY);
    expect(classifyLeadReply('Nâo.').kind).toBe('AMBIGUOUS');
  });

  it('composed and decomposed Unicode forms are equivalent', () => {
    expectAll(['Tá bom.', 'Está bom!', 'Tá bom.'], CONSENT);
    expectAll(['Não me ligue mais.', 'Tire meu número da lista.'], OPT_OUT);
    expectAll(['Pôde marcar.'], CLARIFY);
  });

  it('declared variant: omitting the accent of an allowed form', () => {
    expectAll(['Ta bom.', 'Esta bom.', 'Pode marcar.'], CONSENT);
    expectAll(
      ['Nao me ligue mais.', 'Tire meu numero da lista.', 'Nao quero mais receber ligacoes.'],
      OPT_OUT,
    );
    expect(['nao', 'Não.', 'a tres', 'a três'].map((t) => classifyLeadReply(t))).toEqual([
      { kind: 'NEGATE' },
      { kind: 'NEGATE' },
      { kind: 'SELECT', ordinal: 3 },
      { kind: 'SELECT', ordinal: 3 },
    ]);
  });
});

const REQUESTS = [
  'Tire meu número da lista',
  'Não me ligue mais',
  'Me descadastre',
  'Parem de me ligar',
];
const UNKNOWN = [
  'Só se eu confirmar amanhã',
  'Caso eu não atenda',
  'Talvez semana que vem',
  'Depende do meu sócio',
  'Quando eu voltar de viagem',
  'Meu cachorro latiu',
];
const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
const POSITIONS: ReadonlyArray<(r: string, u: string) => string> = [
  (r, u) => `${r}. ${u}.`,
  (r, u) => `${u}. ${r}.`,
  (r, u) => `${r}, ${lower(u)}.`,
  (r, u) => `${u}, ${lower(r)}.`,
];

describe('selection lookup', () => {
  it('object prototype keys are never an ordinal', () => {
    expect(['constructor', 'a constructor', 'o tostring'].map((t) => classifyLeadReply(t))).toEqual(
      Array(3).fill({ kind: 'AMBIGUOUS' }),
    );
  });
});

describe('I7 — the whole utterance decides; no clause is silently ignored', () => {
  it(`an unknown clause in any position blocks the opt-out (${REQUESTS.length * UNKNOWN.length * POSITIONS.length} occurrences)`, () => {
    expectAll(
      REQUESTS.flatMap((r) => UNKNOWN.flatMap((u) => POSITIONS.map((at) => at(r, u)))),
      CLARIFY,
    );
  });

  it('a negation in the same clause as the form is never a request', () => {
    expectAll(['Não me descadastre.', 'Não, me descadastre.', 'Não, não me ligue mais.'], CLARIFY);
  });

  it('known independent clauses (courtesy, closed list, whole answers) keep the request', () => {
    expectAll(
      [
        'Não se preocupe. Retire meu número da lista.',
        'Obrigado, mas não me ligue mais.',
        'Bom dia. Pode tirar meu número da lista?',
        'Não tenho interesse. Não me ligue mais.',
        'Não, obrigado. Me descadastre.',
        'Retire meu número da lista. Se eu precisar, ligo para vocês.',
        'Não precisa confirmar a reunião, mas não me ligue mais.',
        'Sim, pode marcar, mas depois não me liguem mais.',
        'Me descadastre. Tchau.',
      ],
      OPT_OUT,
    );
  });
});
