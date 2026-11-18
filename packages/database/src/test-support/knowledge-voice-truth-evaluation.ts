import {
  FALSE_TECHNICAL_FACTS,
  QUESTION_ASSOCIATION_LABELS,
  TRUE_TECHNICAL_FACTS,
} from './fixtures/knowledge-voice-truth-labels.js';
import type { VoiceSpokenFact, VoiceTurnObservation } from './knowledge-voice-reply-evaluation.js';

/**
 * SOMENTE TESTES — B2c (DEC-072): M1 (fidelidade ao corpus), M2 (associação),
 * M3 (veracidade) e M4 (cobertura) contra os rótulos CONGELADOS da etapa 1.
 * Relatadas por split; nenhuma é garantia. M3 separa MATERIAL genérico: o
 * extrator não sabe se o material é do corpo, da vedação, do rotor ou do
 * condutor, e a fala diz "sem especificar a peça"; esses acertos são
 * verdadeiros só no nível genérico.
 */
/** "0.5 %" ≡ "0,5 %" (os rótulos usam vírgula decimal). */
const decimal = (value: string) => value.replace(/(\d)\.(\d)/g, '$1,$2');
const key = (subject: string | null, f: Omit<VoiceSpokenFact, 'subject'>) =>
  `${subject}|${f.attribute}|${decimal(f.value)}`;
const TRUE_KEYS = new Set(TRUE_TECHNICAL_FACTS.map((f) => key(f.subject, f)));
const FALSE_KEYS = new Set(FALSE_TECHNICAL_FACTS.map((f) => key(f.subject, f)));

const ratio = (part: number, total: number) => `${part}/${total}`;
const spoken = (os: readonly VoiceTurnObservation[]) =>
  os.flatMap((o) =>
    o.spokenFacts.map((f) => ({
      o,
      f,
      product: QUESTION_ASSOCIATION_LABELS[o.id]?.product ?? null,
    })),
  );

/** M1 — fato falado existe no corpus rotulado (verdadeiro OU falso). Informativa. */
function m1(os: readonly VoiceTurnObservation[]) {
  const all = spoken(os);
  const inCorpus = all.filter(
    ({ f }) => TRUE_KEYS.has(key(f.subject, f)) || FALSE_KEYS.has(key(f.subject, f)),
  );
  return ratio(inCorpus.length, all.length);
}

/** M2 — o valor falado pertence ao produto PERGUNTADO (rótulo), não ao `subject` do extrator. */
function m2(os: readonly VoiceTurnObservation[]) {
  const all = spoken(os);
  const associated = all.filter(
    ({ f, product }) => TRUE_KEYS.has(key(product, f)) || FALSE_KEYS.has(key(product, f)),
  );
  const technical = os.filter(
    (o) => QUESTION_ASSOCIATION_LABELS[o.id]?.expectation === 'TECHNICAL',
  );
  const abstained = technical.filter((o) => o.spokenFacts.length === 0);
  // O compositor não lê a pergunta: mede se ALGUM fato falado é o atributo perguntado.
  const answered = technical.filter((o) =>
    o.spokenFacts.some((f) =>
      QUESTION_ASSOCIATION_LABELS[o.id]!.askedAttributes.includes(f.attribute),
    ),
  );
  return {
    askedAttributeSpoken: ratio(answered.length, technical.length),
    associated: ratio(associated.length, all.length),
    misassociated: all
      .filter((x) => !associated.includes(x))
      .map(({ o, f }) => `${o.id}:${f.attribute}`),
    technicalAbstentions: ratio(abstained.length, technical.length),
  };
}

/** M3 — veracidade contra o conjunto verdadeiro; o D24 é rotulado FALSO. */
function m3(os: readonly VoiceTurnObservation[]) {
  const all = spoken(os);
  const isTrue = all.filter(({ f, product }) => TRUE_KEYS.has(key(product, f)));
  const isFalse = all.filter(({ f, product }) => FALSE_KEYS.has(key(product, f)));
  return {
    trueSpoken: ratio(isTrue.length, all.length),
    falseSpoken: isFalse.map(({ o, f }) => `${o.id}:${f.attribute}:${f.value}`),
    unlabeledSpoken: all
      .filter((x) => !isTrue.includes(x) && !isFalse.includes(x))
      .map(({ o, f }) => `${o.id}:${f.attribute}:${f.value}`),
    genericMaterialAmongTrue: isTrue.filter(({ f }) => f.attribute === 'MATERIAL').length,
  };
}

/** M4 — estados técnicos por expectativa rotulada (sem meta para o merge). */
function m4(os: readonly VoiceTurnObservation[]) {
  const states: Record<string, Record<string, number>> = {};
  for (const o of os) {
    const expectation = QUESTION_ASSOCIATION_LABELS[o.id]?.expectation ?? 'UNLABELED';
    const row = (states[expectation] ??= {});
    row[o.technical] = (row[o.technical] ?? 0) + 1;
  }
  return states;
}

function splitReport(os: readonly VoiceTurnObservation[]) {
  return { questions: os.length, m1: m1(os), m2: m2(os), m3: m3(os), m4: m4(os) };
}

export function voiceTruthReport(observations: readonly VoiceTurnObservation[]) {
  return {
    dev: splitReport(observations.filter((o) => o.split === 'dev')),
    holdout: splitReport(observations.filter((o) => o.split === 'holdout')),
  };
}

/** Sanidade dos rótulos usados (nunca alterados aqui): todas as perguntas observadas têm rótulo. */
export const unlabeledQuestions = (observations: readonly VoiceTurnObservation[]) =>
  observations.filter((o) => !QUESTION_ASSOCIATION_LABELS[o.id]).map((o) => o.id);
