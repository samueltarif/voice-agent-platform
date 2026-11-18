import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposableTestDatabase,
  createKnowledgeEvaluationFixture,
  EVALUATION_QUESTIONS,
  projectPreview,
  projectRetrieval,
  type KnowledgeEvaluationFixture,
} from './test-support/index.js';
import {
  DrizzleKnowledgeRetrievalPreviewService,
  DrizzleKnowledgeRetrievalService,
} from './repositories/index.js';
import { V1_CHARACTERIZATION } from './test-support/fixtures/knowledge-retrieval-v1-characterization.expected.js';

const tdb = await createDisposableTestDatabase('knowledge-retrieval-v1-characterization');

/**
 * PR B1 (DEC-067) — a busca v1 (padrão de TODOS os agentes, inclusive os
 * publicados) devolve exatamente o mesmo resultado de antes da B1, pergunta a
 * pergunta, na busca e na pré-visualização. Criado antes de mudar o fluxo.
 */
describe('Knowledge retrieval v1 — characterization (exact output preserved)', () => {
  let fx: KnowledgeEvaluationFixture;
  let retrieval: DrizzleKnowledgeRetrievalService;
  let preview: DrizzleKnowledgeRetrievalPreviewService;

  beforeAll(async () => {
    fx = await createKnowledgeEvaluationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    retrieval = new DrizzleKnowledgeRetrievalService(tdb.db);
    preview = new DrizzleKnowledgeRetrievalPreviewService(tdb.db);
  }, 120_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  it('covers every question of the evaluation corpus', () => {
    expect(Object.keys(V1_CHARACTERIZATION).sort()).toEqual(
      EVALUATION_QUESTIONS.map((q) => q.id).sort(),
    );
  });

  it.each(EVALUATION_QUESTIONS.map((q) => [q.id, q] as const))(
    '%s: identical v1 retrieval and preview',
    async (id, question) => {
      const organizationId = question.org === 'A' ? fx.orgA : fx.orgB;
      // Teto acima do total de trechos do corpus: sem corte entre empates.
      const query = { queryText: question.query, topK: 20 };
      const result = await retrieval.retrieve({ scope: { organizationId }, query });
      const shown = await preview.preview({ organizationId, queryText: question.query, topK: 10 });
      expect(projectRetrieval(result, fx.documentKeys)).toBe(V1_CHARACTERIZATION[id]!.retrieval);
      expect(projectPreview(shown, fx.documentKeys)).toBe(V1_CHARACTERIZATION[id]!.preview);
    },
  );
});
