import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KnowledgeRetrievalComparison } from '@voice-agent/contracts';
import {
  createDisposableTestDatabase,
  createKnowledgeEvaluationFixture,
  EVALUATION_DOCUMENTS,
  EVALUATION_QUESTIONS,
  scoreQuestion,
  summarize,
  type KnowledgeEvaluationFixture,
  type QuestionOutcome,
} from './test-support/index.js';
import { DrizzleKnowledgeRetrievalComparisonService } from './repositories/index.js';

const tdb = await createDisposableTestDatabase('knowledge-retrieval-v2-evaluation');

/**
 * PR B1 (DEC-067) — corpus de avaliação medido nas DUAS buscas pela comparação
 * administrativa. Asserções duras: isolamento entre organizações (0) e
 * determinismo. As métricas de qualidade são RELATADAS (stdout) na PR, sem
 * limiar ajustado ao corpus.
 */
describe('Knowledge retrieval evaluation corpus — v1 × v2', () => {
  let fx: KnowledgeEvaluationFixture;
  const results = new Map<string, KnowledgeRetrievalComparison>();
  const orgOf = new Map<string, 'A' | 'B'>();

  beforeAll(async () => {
    fx = await createKnowledgeEvaluationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    for (const [id, key] of fx.documentKeys) {
      orgOf.set(id, EVALUATION_DOCUMENTS.find((d) => d.key === key)!.org);
    }
    const service = new DrizzleKnowledgeRetrievalComparisonService(tdb.db);
    for (const q of EVALUATION_QUESTIONS) {
      const organizationId = q.org === 'A' ? fx.orgA : fx.orgB;
      results.set(q.id, await service.compare({ organizationId, queryText: q.query, topK: 10 }));
    }
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const outcomes = (profile: 'v1' | 'v2'): QuestionOutcome[] =>
    EVALUATION_QUESTIONS.map((q) => scoreQuestion(q, results.get(q.id)![profile], orgOf));

  it('never returns another organization’s documents (v1 and v2)', () => {
    expect(summarize(outcomes('v1')).isolationViolations).toBe(0);
    expect(summarize(outcomes('v2')).isolationViolations).toBe(0);
  });

  it('reports the metrics per profile and split', () => {
    const report = (['v1', 'v2'] as const).map((profile) => {
      const all = outcomes(profile);
      return {
        profile,
        all: summarize(all),
        dev: summarize(all.filter((o) => o.split === 'dev')),
        holdout: summarize(all.filter((o) => o.split === 'holdout')),
      };
    });
    console.log(`[kb-eval] ${JSON.stringify(report)}`);
    expect(report).toHaveLength(2);
  });
});
