import type { KnowledgeRetrievalPreview } from '@voice-agent/contracts';
import type { EvaluationQuestion } from './fixtures/knowledge-evaluation-questions.js';

/**
 * SOMENTE TESTES (PR B1 / DEC-067): métricas do corpus sobre o que a
 * pré-visualização MOSTRA (recortes), igual para v1 e v2.
 * - precisão: trechos DIRECT sem marcador proibido ÷ trechos DIRECT;
 * - recall@3: perguntas com evidência cujos marcadores aparecem nos 3 primeiros DIRECT;
 * - negativas: perguntas sem evidência que ficaram sem DIRECT;
 * - aspectos (v2): `aspectsNotFound` igual ao esperado;
 * - isolamento: trechos de documento de outra organização (precisa ser 0).
 */
export interface QuestionOutcome {
  readonly id: string;
  readonly split: 'dev' | 'holdout';
  readonly direct: number;
  readonly forbidden: number;
  readonly recallOk: boolean | null;
  readonly negativeOk: boolean | null;
  readonly aspectsOk: boolean | null;
  readonly isolationViolations: number;
}

function aspectsMatch(q: EvaluationQuestion, shown: KnowledgeRetrievalPreview): boolean | null {
  if (!q.aspectsNotFound || shown.aspectsNotFound === undefined) return null;
  const sorted = (list: readonly string[]) => [...list].sort().join(',');
  return sorted(shown.aspectsNotFound) === sorted(q.aspectsNotFound);
}

function recallOf(q: EvaluationQuestion, direct: KnowledgeRetrievalPreview['hits']): boolean {
  const top3 = direct
    .slice(0, 3)
    .map((h) => h.excerpt)
    .join('\n');
  return (q.mustShow ?? []).every((m) => top3.includes(m)) && direct.length > 0;
}

export function scoreQuestion(
  q: EvaluationQuestion,
  shown: KnowledgeRetrievalPreview,
  orgOfDocument: ReadonlyMap<string, 'A' | 'B'>,
): QuestionOutcome {
  const direct = shown.hits.filter((h) => h.relevance === 'DIRECT');
  const forbidden = direct.filter((h) => (q.mustNotShow ?? []).some((m) => h.excerpt.includes(m)));
  const wrongOrg = shown.hits.filter((h) => orgOfDocument.get(h.documentId) !== q.org);
  return {
    id: q.id,
    split: q.split,
    direct: q.evidence ? direct.length : 0,
    forbidden: q.evidence ? forbidden.length : direct.length,
    recallOk: q.evidence ? recallOf(q, direct) : null,
    negativeOk: q.evidence ? null : direct.length === 0,
    aspectsOk: aspectsMatch(q, shown),
    isolationViolations: wrongOrg.length,
  };
}

const ratio = (num: number, den: number) =>
  den === 0 ? null : Math.round((num / den) * 1000) / 1000;
const count = (list: readonly (boolean | null)[]) => ({
  ok: list.filter((v) => v === true).length,
  of: list.filter((v) => v !== null).length,
});

export function summarize(outcomes: readonly QuestionOutcome[]) {
  const shownDirect = outcomes.reduce((n, o) => n + o.direct, 0);
  const negativeFp = outcomes
    .filter((o) => o.negativeOk === false)
    .reduce((n, o) => n + o.forbidden, 0);
  const forbidden = outcomes.reduce((n, o) => n + (o.negativeOk === null ? o.forbidden : 0), 0);
  const recall = count(outcomes.map((o) => o.recallOk));
  const negatives = count(outcomes.map((o) => o.negativeOk));
  const aspects = count(outcomes.map((o) => o.aspectsOk));
  return {
    precision: ratio(shownDirect - forbidden, shownDirect + negativeFp),
    recallAt3: ratio(recall.ok, recall.of),
    negativeAccuracy: ratio(negatives.ok, negatives.of),
    aspectAccuracy: ratio(aspects.ok, aspects.of),
    isolationViolations: outcomes.reduce((n, o) => n + o.isolationViolations, 0),
    failed: outcomes
      .filter(
        (o) =>
          o.recallOk === false ||
          o.negativeOk === false ||
          o.aspectsOk === false ||
          (o.negativeOk === null && o.forbidden > 0),
      )
      .map((o) => o.id),
  };
}
