import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';

/**
 * E2 PR 1 — 2ª auditoria (A1/A2): casos exatos do Codex + matriz determinística.
 * As expectativas vêm da CATEGORIA de cada entrada (escrita à mão), nunca do
 * próprio classificador.
 */

type EventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

/** Protocolo até a releitura entregue; aplica a fala; tenta consumir; devolve o que aconteceu. */
function flow(text: string) {
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

const NOT_CONSENT_FLOW = { phase: 'AWAITING_CONFIRMATION', directives: ['ASK_CLARIFICATION'] };
const CONSENT_FLOW = { phase: 'BOOKING', directives: ['BOOK'] };
const OPT_OUT_FLOW = { phase: 'OPTED_OUT', directives: ['RECORD_OPT_OUT'] };

function expectAll(
  cases: readonly string[],
  kind: string,
  expectedFlow: { phase: string; directives: string[] },
) {
  for (const text of cases) {
    expect([text, classifyLeadReply(text).kind]).toEqual([text, kind]);
    expect([text, flow(text)]).toEqual([text, expectedFlow]);
  }
}

describe('A1/A2 — exact cases from the second Codex audit', () => {
  it("'sim' (ASCII apostrophes) and Pode marcar？ (U+FF1F) are not consent", () => {
    expectAll(["'sim'", 'Pode marcar？'], 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it('informational question and future hypothesis are not opt-out', () => {
    expectAll(
      [
        'Como faço para tirar meu número da lista, caso precise?',
        'Se eu mudar de ideia, vou pedir para tirar meu número.',
      ],
      'AMBIGUOUS',
      NOT_CONSENT_FLOW,
    );
  });

  it('a courteous interrogative request is opt-out', () => {
    expectAll(['Pode, por favor, tirar meu número da lista?'], 'OPT_OUT', OPT_OUT_FLOW);
  });
});

// ---- Matriz A1 -------------------------------------------------------------
const ACCEPT_FORMS = [
  'sim',
  'Sim',
  'pode marcar',
  'Pode marcar',
  'sim, pode marcar',
  'isso mesmo',
  'confirmo',
  'Pode confirmar',
];
const QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
  ['„', '“'],
  ['‹', '›'],
  ['`', '`'],
  ['＂', '＂'],
  ['＇', '＇'],
  ['「', '」'],
  ['『', '』'],
];
const QUESTIONS = ['?', '？', '¿', '؟', '⸮', '‽', '﹖', '??', '?!', ' ?'];
const INVISIBLE = ['​', '‌', '‍', '⁠', '﻿', '­', '‮', '⁦', '\u0007', '\u001B'];
const TERMINAL_OK = ['', '.', '!', '...', '!!', ' .', '  ', '.!'];

describe('A1 matrix — consent only from plain, unequivocal whole-utterance forms', () => {
  it(`quoted acceptance (${ACCEPT_FORMS.length * QUOTES.length} cases) is never consent`, () => {
    const cases = ACCEPT_FORMS.flatMap((form) =>
      QUOTES.map(([open, close]) => `${open}${form}${close}`),
    );
    expectAll(cases, 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it(`questioned acceptance (${ACCEPT_FORMS.length * QUESTIONS.length} cases) is never consent`, () => {
    const cases = ACCEPT_FORMS.flatMap((form) => QUESTIONS.map((q) => `${form}${q}`));
    expectAll(cases, 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it(`acceptance with invisible or control characters (${ACCEPT_FORMS.length * INVISIBLE.length * 2} cases) is never consent`, () => {
    const cases = ACCEPT_FORMS.flatMap((form) =>
      INVISIBLE.flatMap((ch) => [`${ch}${form}`, `${form.slice(0, 2)}${ch}${form.slice(2)}`]),
    );
    expectAll(cases, 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it('conditional, reported, negated and mixed replies are never consent', () => {
    const reported = [
      'Ele disse que sim.',
      'Meu sócio falou: pode marcar.',
      'Ela respondeu sim',
      'Disseram que pode marcar',
    ];
    const conditional = [
      'Se meu sócio concordar, pode marcar.',
      'Sim, se não chover.',
      'Caso dê, pode marcar',
      'Pode marcar, se for de manhã',
    ];
    const mixed = [
      'Sim, mas não marque.',
      'Sim e não',
      'Acho que sim',
      'Talvez sim',
      'Sim sim, quer dizer, não',
    ];
    expectAll([...reported, ...conditional, ...mixed], 'AMBIGUOUS', NOT_CONSENT_FLOW);
    expectAll(['não', 'Não.', 'Não, obrigado.', 'nenhum desses'], 'NEGATE', {
      phase: 'AWAITING_SELECTION',
      directives: ['ASK_CLARIFICATION'],
    });
  });

  it(`unequivocal acceptance with ordinary spacing and terminal punctuation (${ACCEPT_FORMS.length * TERMINAL_OK.length} cases) still authorizes`, () => {
    const cases = ACCEPT_FORMS.flatMap((form) => TERMINAL_OK.map((end) => ` ${form}${end}`));
    expectAll(cases, 'AFFIRM', CONSENT_FLOW);
    expectAll(['Ｓｉｍ', 'Sim!!', 'Isso mesmo!', 'Sim,  pode   marcar.'], 'AFFIRM', CONSENT_FLOW);
  });
});

// ---- Matriz A2 -------------------------------------------------------------
const REQUEST_OBJECTS = [
  'tirar meu número da lista',
  'me descadastrar',
  'parar de me ligar',
  'remover meu telefone',
];
const IMPERATIVES = [
  'Não me ligue mais',
  'Retire meu número da lista',
  'Me descadastre',
  'Parem de me ligar',
  'Tire meu telefone da lista',
  'Não quero mais receber ligações',
];
const COURTESY: ReadonlyArray<(s: string) => string> = [
  (s) => s,
  (s) => `Por favor, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `${s}, por favor`,
  (s) => `Olha, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `Obrigado pela ligação. ${s}`,
];
const ENDS = ['.', '!', ''];

describe('A2 matrix — current explicit requests are opt-out', () => {
  it(`imperative requests with courtesy and punctuation (${IMPERATIVES.length * COURTESY.length * ENDS.length} cases)`, () => {
    const cases = IMPERATIVES.flatMap((s) =>
      COURTESY.flatMap((wrap) => ENDS.map((end) => `${wrap(s)}${end}`)),
    );
    expectAll(cases, 'OPT_OUT', OPT_OUT_FLOW);
  });

  it(`interrogative requests, with interposed courtesy (${REQUEST_OBJECTS.length * 5} cases)`, () => {
    const cases = REQUEST_OBJECTS.flatMap((o) => [
      `Pode ${o}?`,
      `Pode, por favor, ${o}?`,
      `Vocês podem ${o}?`,
      `Por favor, poderia ${o}?`,
      `Tem como ${o}?`,
    ]);
    expectAll(cases, 'OPT_OUT', OPT_OUT_FLOW);
  });

  it('a current request survives unrelated negations and other clauses', () => {
    expectAll(
      [
        'Não precisa confirmar a reunião, mas não me ligue mais.',
        'Hoje não posso. Retire meu número da lista.',
        'Sim, pode marcar, mas depois não me liguem mais.',
        'Quero que remova meu telefone.',
      ],
      'OPT_OUT',
      OPT_OUT_FLOW,
    );
  });
});

describe('A2 matrix — questions, hypotheses, intentions, negations, reports and quotes are not opt-out', () => {
  it(`informational questions, hypotheses, future intentions and reports (${REQUEST_OBJECTS.length * 9} cases)`, () => {
    const cases = REQUEST_OBJECTS.flatMap((o) => [
      `Como faço para ${o}?`,
      `O que acontece se eu pedir para ${o}?`,
      `Como faço para ${o}, caso precise?`,
      `Se eu mudar de ideia, vou pedir para ${o}.`,
      `Caso eu precise, peço para ${o}.`,
      `Vou pedir para ${o} amanhã.`,
      `Talvez eu peça para ${o}.`,
      `Meu sócio disse para ${o}.`,
      `Não precisa ${o}.`,
    ]);
    expectAll(cases, 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it(`quoted requests (${IMPERATIVES.length * QUOTES.length} cases)`, () => {
    const cases = IMPERATIVES.flatMap((s) =>
      QUOTES.map(([open, close]) => `Ele falou ${open}${s.toLowerCase()}${close}.`),
    );
    expectAll(cases, 'AMBIGUOUS', NOT_CONSENT_FLOW);
  });

  it('mentions without a request', () => {
    expectAll(
      [
        'O que significa descadastrar?',
        'Eu não pedi para ser descadastrado.',
        'Não é para tirar meu número.',
        'Hoje não posso.',
      ],
      'AMBIGUOUS',
      NOT_CONSENT_FLOW,
    );
  });
});
