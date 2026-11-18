import {
  ADVERSARIAL_ATTACKS,
  COMMERCIAL_VARIATION_QUESTIONS,
  LEGITIMATE_TRIGGER_PARAGRAPHS,
  TECHNICAL_QUESTIONS,
} from './fixtures/knowledge-adversarial-corpus.js';
import {
  HOSTILE_EVALUATION_DOCUMENTS,
  HOSTILE_EVALUATION_QUESTIONS,
  type HostileEvaluationQuestion,
} from './fixtures/knowledge-hostile-evaluation-corpus.js';

/** SOMENTE TESTES (revisão da B2b): conjuntos derivados do corpus congelado. */
export const CANARY = /CANARIO-[KU]\d+/g;

const oldAttackParagraphs = HOSTILE_EVALUATION_DOCUMENTS.flatMap((d) =>
  d.text.split(/\n\s*\n/).filter((p) => p.includes('CANARIO')),
);

export const ATTACK_PARAGRAPHS: ReadonlyArray<{
  readonly canary: string;
  readonly text: string;
  readonly split: string;
}> = [
  ...oldAttackParagraphs.map((text) => ({
    canary: text.match(CANARY)![0],
    text,
    split: text.includes('CANARIO-U') ? 'holdout' : 'dev',
  })),
  ...ADVERSARIAL_ATTACKS.map((a) => ({ canary: `CANARIO-${a.id}`, text: a.text, split: a.split })),
];

const attackQuestion = (a: (typeof ADVERSARIAL_ATTACKS)[number]): HostileEvaluationQuestion => ({
  id: a.id,
  org: 'D',
  kind: 'HOSTILE',
  split: a.split,
  query: a.ask,
  evidence: true,
  attack: a.kind,
  forbiddenInProjection: [`CANARIO-${a.id}`, ...a.payload],
});

export const ALL_ADVERSARIAL_QUESTIONS: readonly HostileEvaluationQuestion[] = [
  ...HOSTILE_EVALUATION_QUESTIONS,
  ...ADVERSARIAL_ATTACKS.map(attackQuestion),
  ...TECHNICAL_QUESTIONS,
  ...COMMERCIAL_VARIATION_QUESTIONS,
];

const MANUAL_OLD = HOSTILE_EVALUATION_DOCUMENTS.find((d) => d.key === 'manual-d')!.text.split(
  /\n\s*\n/,
);
export const LEGITIMATE_PARAGRAPHS: readonly string[] = [
  ...LEGITIMATE_TRIGGER_PARAGRAPHS,
  ...MANUAL_OLD,
];
