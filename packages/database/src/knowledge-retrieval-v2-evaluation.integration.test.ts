import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KnowledgeRetrievalComparison } from '@voice-agent/contracts';
import {
  createDisposableTestDatabase,
  createKnowledgeEvaluationExtensionFixture,
  createKnowledgeEvaluationFixture,
  EVALUATION_DOCUMENTS,
  EVALUATION_EXTENSION_DOCUMENTS,
  EVALUATION_EXTENSION_QUESTIONS,
  EVALUATION_QUESTIONS,
  scoreQuestion,
  summarize,
  type EvaluationOrg,
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
  const results = new Map<string, KnowledgeRetrievalComparison>();
  const orgOf = new Map<string, EvaluationOrg>();
  const all = [...EVALUATION_QUESTIONS, ...EVALUATION_EXTENSION_QUESTIONS];

  beforeAll(async () => {
    const run = Math.random().toString(36).slice(2, 8);
    const fx = await createKnowledgeEvaluationFixture(tdb.db, run);
    const ext = await createKnowledgeEvaluationExtensionFixture(tdb.db, run);
    const docs = [...EVALUATION_DOCUMENTS, ...EVALUATION_EXTENSION_DOCUMENTS];
    for (const [id, key] of [...fx.documentKeys, ...ext.documentKeys]) {
      orgOf.set(id, docs.find((d) => d.key === key)!.org);
    }
    const orgIds: Partial<Record<EvaluationOrg, string>> = { A: fx.orgA, B: fx.orgB, C: ext.orgC };
    const service = new DrizzleKnowledgeRetrievalComparisonService(tdb.db);
    for (const q of all) {
      const organizationId = orgIds[q.org]!;
      results.set(q.id, await service.compare({ organizationId, queryText: q.query, topK: 10 }));
    }
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const outcomes = (profile: 'v1' | 'v2'): QuestionOutcome[] =>
    all.map((q) => scoreQuestion(q, results.get(q.id)![profile], orgOf));
  const original = new Set(EVALUATION_QUESTIONS.map((q) => q.id));

  it('never returns another organization’s documents (v1 and v2)', () => {
    expect(summarize(outcomes('v1')).isolationViolations).toBe(0);
    expect(summarize(outcomes('v2')).isolationViolations).toBe(0);
  });

  it('reports the metrics per profile and split', () => {
    const report = (['v1', 'v2'] as const).map((profile) => {
      const list = outcomes(profile);
      const base = list.filter((o) => original.has(o.id));
      return {
        profile,
        all: summarize(base),
        dev: summarize(base.filter((o) => o.split === 'dev')),
        holdout: summarize(base.filter((o) => o.split === 'holdout')),
        extensionDev: summarize(list.filter((o) => !original.has(o.id))),
      };
    });
    console.log(`[kb-eval] ${JSON.stringify(report)}`);
    expect(report).toHaveLength(2);
  });
});
