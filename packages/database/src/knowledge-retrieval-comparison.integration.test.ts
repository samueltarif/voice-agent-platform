import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  type KnowledgeSimulationFixture,
} from './test-support/index.js';
import {
  DrizzleKnowledgeRetrievalComparisonService,
  DrizzleKnowledgeRetrievalPreviewService,
} from './repositories/index.js';

const tdb = await createDisposableTestDatabase('knowledge-retrieval-comparison');

/**
 * PR B1 (DEC-067): a comparação administrativa v1 × v2 usa o MESMO escopo da
 * pré-visualização (organização; agente ativo + versão publicada) e a coluna
 * v1 é exatamente a pré-visualização existente.
 */
describe('Knowledge retrieval comparison — scope (v1 × v2)', () => {
  let fx: KnowledgeSimulationFixture;
  const service = new DrizzleKnowledgeRetrievalComparisonService(tdb.db);
  const preview = new DrizzleKnowledgeRetrievalPreviewService(tdb.db);
  const pump = 'Vocês têm a bomba centrífuga BC-90?';

  beforeAll(async () => {
    fx = await createKnowledgeSimulationFixture(tdb.db, 'cmp');
  }, 120_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  const docs = (hits: ReadonlyArray<{ excerpt: string }>) => hits.map((h) => h.excerpt).join(' ');

  it('v1 column is the unchanged preview; v2 is labelled and untrusted', async () => {
    const input = { organizationId: fx.orgA, queryText: 'Qual a faixa do QT-310?', topK: 10 };
    const result = await service.compare(input);
    const sort = <T extends { citationId: string }>(h: readonly T[]) =>
      [...h].sort((a, b) => a.citationId.localeCompare(b.citationId));
    const expected = await preview.preview(input);
    expect({ ...result.v1, hits: sort(result.v1.hits) }).toEqual({
      ...expected,
      hits: sort(expected.hits),
      retrievalProfile: 'v1',
    });
    expect(result.trust).toBe('UNTRUSTED_DATA');
    expect(result.v2).toMatchObject({ trust: 'UNTRUSTED_DATA', retrievalProfile: 'v2' });
    expect(docs(result.v2.hits)).toContain('QT-310');
  });

  it('keeps the agent scope: a document fixed to another agent never appears in v2', async () => {
    const sales = await service.compare({
      organizationId: fx.orgA,
      agentId: fx.sales,
      queryText: pump,
    });
    const support = await service.compare({
      organizationId: fx.orgA,
      agentId: fx.support,
      queryText: pump,
    });
    expect(docs(sales.v1.hits)).not.toContain('BC-90');
    expect(docs(sales.v2.hits)).not.toContain('BC-90');
    expect(docs(support.v2.hits)).toContain('BC-90');
    expect(sales.v2).toMatchObject({ mode: 'AGENT', agentId: fx.sales });
    expect(sales.v2.agentVersionId).toBe(sales.v1.agentVersionId);
  });

  it('keeps the organization: another organization’s documents never appear', async () => {
    const result = await service.compare({
      organizationId: fx.orgA,
      queryText: 'helicóptero H-125',
    });
    expect(docs(result.v1.hits)).not.toContain('Helicóptero');
    expect(docs(result.v2.hits)).not.toContain('Helicóptero');
    const own = await service.compare({ organizationId: fx.orgB, queryText: 'helicóptero H-125' });
    expect(docs(own.v2.hits)).toContain('H-125');
  });

  it.each([
    ['other organization agent', 'salesB', 'KNOWLEDGE_AGENT_UNAVAILABLE'],
    ['archived agent', 'archived', 'KNOWLEDGE_AGENT_UNAVAILABLE'],
    ['agent without a published version', 'draftOnly', 'KNOWLEDGE_AGENT_NOT_PUBLISHED'],
  ] as const)('refuses %s exactly like the preview', async (_label, key, code) => {
    const input = { organizationId: fx.orgA, agentId: fx[key], queryText: 'QT-310' };
    await expect(preview.preview(input)).rejects.toMatchObject({ code });
    await expect(service.compare(input)).rejects.toMatchObject({ code });
  });
});
