import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';
import { toMatchForm } from './lead-reply-text.js';

/**
 * E2 PR 1 — 3ª auditoria (A1/A2): casos exatos e invariantes I1–I5.
 * Expectativas escritas por categoria, independentes do classificador.
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

const CLARIFY = {
  kind: 'AMBIGUOUS',
  flow: { phase: 'AWAITING_CONFIRMATION', directives: ['ASK_CLARIFICATION'] },
};
const CONSENT = { kind: 'AFFIRM', flow: { phase: 'BOOKING', directives: ['BOOK'] } };
const OPT_OUT = { kind: 'OPT_OUT', flow: { phase: 'OPTED_OUT', directives: ['RECORD_OPT_OUT'] } };

function expectAll(
  cases: readonly string[],
  expected: { kind: string; flow: { phase: string; directives: string[] } },
) {
  for (const text of cases) {
    expect([text, classifyLeadReply(text).kind, flow(text)]).toEqual([
      text,
      expected.kind,
      expected.flow,
    ]);
  }
}

describe('third Codex audit — exact cases', () => {
  it('“Sim, нет.” is not consent', () => expectAll(['Sim, нет.'], CLARIFY));
  it('a multi-sentence quotation is not an opt-out', () =>
    expectAll(['Ela disse: “Hoje não posso. Não me ligue mais. Obrigada.”'], CLARIFY));
  it('a request restricted by a later condition is not definitive', () =>
    expectAll(['Tire meu número da lista, mas só se eu confirmar amanhã.'], CLARIFY));
});

const ACCEPT = ['Sim', 'Pode marcar', 'Sim, pode marcar', 'Isso mesmo', 'Confirmo'];
const FOREIGN = ['нет', 'да', 'όχι', 'ναι', 'لا', 'نعم', '不', '是', 'いいえ', '아니요', 'नहीं'];

describe('I1 — no consent from lost lexical content', () => {
  it(`unknown words from other scripts are never dropped (${ACCEPT.length * FOREIGN.length * 2} occurrences)`, () => {
    const cases = ACCEPT.flatMap((form) =>
      FOREIGN.flatMap((word) => [`${form}, ${word}.`, `${word} ${form}`]),
    );
    expectAll(cases, CLARIFY);
  });

  it('mixed-script look-alikes and non-Portuguese diacritics are not acceptance', () => {
    expectAll(
      [
        'sіm', // і cirílico
        'ѕim', // ѕ cirílico
        'pоde marcar', // о cirílico
        'sìm',
        'śim',
        'śim', // combinante sobre s
        'sïm', // trema sobre i
        'si̲m', // sublinhado combinante (sem forma composta)
        'Sim̶', // tachado combinante
      ],
      CLARIFY,
    );
  });

  it('conversion keeps one token per lexical token of the input', () => {
    for (const text of ['Sim, нет.', 'Não, obrigado!', 'Tá bom', 'si̲m', 'Ｓｉｍ', 'pоde marcar']) {
      const lexical = text.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [];
      expect([text, toMatchForm(text.normalize('NFKC')).split(' ').length]).toEqual([
        text,
        lexical.length,
      ]);
    }
  });

  it('legitimate Portuguese accents and approved Unicode variants still work', () => {
    expectAll(['Tá bom.', 'Está bom!', 'Ｓｉｍ', 'Sim, pode marcar.'], CONSENT);
    expect(classifyLeadReply('Não, obrigado.').kind).toBe('NEGATE');
  });
});

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['«', '»'],
  ["'", "'"],
  ['‘', '’'],
  ['„', '“'],
];

describe('I2 — no opt-out from quoted, hypothetical or reported content', () => {
  it(`multi-sentence quotations with internal punctuation (${QUOTE_PAIRS.length * 4} occurrences)`, () => {
    const cases = QUOTE_PAIRS.flatMap(([o, c]) => [
      `Ela disse: ${o}Hoje não posso. Não me ligue mais. Obrigada.${c}`,
      `Ele gritou ${o}Retire meu número da lista!${c} e desligou.`,
      `${o}Pode tirar meu número da lista?${c}, perguntou meu sócio.`,
      `O cliente escreveu ${o}Oi. Me descadastre. Tchau.${c} no e-mail.`,
    ]);
    expectAll(cases, CLARIFY);
  });

  it('incomplete or unbalanced quotation marks never yield an opt-out', () => {
    expectAll(
      [
        'Ela disse: “Não me ligue mais.',
        'Não me ligue mais.” disse ela.',
        'Ele falou "retire meu número da lista. Obrigado.',
        "Ela disse 'me descadastre.",
      ],
      CLARIFY,
    );
  });

  it('hypotheses and reports in the same sentence are not requests', () => {
    expectAll(
      [
        'Se eu mudar de ideia, vou pedir para tirar meu número.',
        'Meu sócio disse para parar de me ligar.',
        'Caso precise, me descadastre.',
      ],
      CLARIFY,
    );
  });
});

const REQUESTS = [
  'Tire meu número da lista',
  'Não me ligue mais',
  'Me descadastre',
  'Parem de me ligar',
];
const RESTRICTIONS = [
  'mas só se eu confirmar amanhã',
  'mas somente amanhã',
  'mas talvez eu mude de ideia',
  'mas depende do meu sócio',
  'mas apenas se eu não atender',
];

describe('I3 — restrictions are never lost by segmentation', () => {
  it(`a later restriction in the same sentence blocks the request (${REQUESTS.length * RESTRICTIONS.length} occurrences)`, () => {
    expectAll(
      REQUESTS.flatMap((r) => RESTRICTIONS.map((x) => `${r}, ${x}.`)),
      CLARIFY,
    );
  });

  it('a restriction after a sentence break that starts with a contrast, or after a semicolon, is kept', () => {
    expectAll(
      [
        'Tire meu número da lista. Mas só se eu confirmar amanhã.',
        'Não me ligue mais! Porém, só se eu não atender.',
        'Me descadastre; só se eu não responder.',
        'Parem de me ligar; talvez semana que vem.',
      ],
      CLARIFY,
    );
  });

  it('an unrelated negation or contrast does not cancel an independent request', () => {
    expectAll(
      [
        'Não precisa confirmar a reunião, mas não me ligue mais.',
        'Sim, pode marcar, mas depois não me liguem mais.',
        'Hoje não posso. Retire meu número da lista.',
        'Retire meu número da lista. Se eu precisar, ligo para vocês.',
      ],
      OPT_OUT,
    );
  });
});

describe('I4 — rule-covered requests and acceptances keep working', () => {
  it('direct, courteous and interrogative requests', () => {
    expectAll(
      [
        'Não me ligue mais.',
        'Retire meu número da lista.',
        'Pode tirar meu número da lista?',
        'Pode, por favor, tirar meu número da lista?',
        'Por favor, me descadastre.',
      ],
      OPT_OUT,
    );
  });

  it('plain acceptances', () =>
    expectAll(['Sim', 'Sim!', 'Pode marcar.', 'Isso mesmo!', 'Sim, pode marcar.'], CONSENT));
});

describe('I5 — inputs outside the recognized grammar never authorize', () => {
  it(`symbols, emoji, separators and markup around acceptance (${ACCEPT.length * 8} occurrences)`, () => {
    const decorate = [
      (s: string) => `${s} 👍`,
      (s: string) => `${s} :)`,
      (s: string) => `${s}#`,
      (s: string) => `${s}/`,
      (s: string) => s.split('').join('.'),
      (s: string) => `<b>${s}</b>`,
      (s: string) => `${s} ✓`,
      (s: string) => `*${s}*`,
    ];
    expectAll(
      ACCEPT.flatMap((s) => decorate.map((d) => d(s))),
      CLARIFY,
    );
  });
});
