import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import {
  DrizzleKnowledgeRetrievalPreviewService,
  DrizzleKnowledgeRetrievalService,
  ingestKnowledgeDocument,
} from './repositories/index.js';
import { organizations } from './schema/organizations.js';
import { agents } from './schema/agents.js';
import { knowledgeChunks, knowledgeDocuments } from './schema/knowledge.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

/**
 * Catálogo fictício no formato do catálogo real da homologação: produtos + FAQ
 * comercial genérico (preços, prazos, disponibilidade). O nome da empresa
 * aparece na maioria dos trechos.
 */
const SECTIONS = [
  'Qualitec Instrumentação. A Qualitec oferece soluções completas para óleo e gás em todo o Brasil.',
  'Transmissor de Pressão Manométrica QT-310 da Qualitec. Faixa de 0 a 400 bar, saída 4-20 mA com HART.',
  'Transmissor de Pressão Diferencial QT-520 da Qualitec. Faixa de 0 a 25 bar, para medição de vazão.',
  'Válvula Esfera Bipartida VE-200 da Qualitec. Corpo em aço inox 316, classe 300.',
  'Perguntas frequentes sobre preços: os preços da Qualitec são enviados por orçamento, com validade de 15 dias.',
  'Prazo de entrega e disponibilidade: itens em estoque saem em 5 dias úteis; demais itens sob consulta.',
];

/** Regressão da homologação da #157: termo genérico ("preço") não é evidência de produto. */
describe('Knowledge retrieval relevance: generic vs entity terms (integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const retrieval = new DrizzleKnowledgeRetrievalService(db);
  const runId = Math.random().toString(36).substring(2, 8);
  const orgIds: string[] = [];
  let orgA = '';
  let orgB = '';
  let agentSales = '';

  async function ingest(orgId: string, locator: string, text: string) {
    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `Catálogo ${runId}`,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `${runId}/${locator}` },
      rawText: text,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 120, overlapChars: 0 },
    });
    return result.document.id;
  }

  function ask(queryText: string, topK = 5, orgId = orgA) {
    return retrieval.retrieve({
      scope: { organizationId: orgId, agentId: agentSales },
      query: { queryText, topK },
    });
  }

  beforeAll(async () => {
    const orgRepo = new OrganizationRepository(db);
    const a = await orgRepo.createOrganization({
      slug: `kbrel-a-${runId}`,
      name: 'A',
      status: 'ACTIVE',
    });
    const b = await orgRepo.createOrganization({
      slug: `kbrel-b-${runId}`,
      name: 'B',
      status: 'ACTIVE',
    });
    orgA = a!.id;
    orgB = b!.id;
    orgIds.push(orgA, orgB);
    const [sales] = await db
      .insert(agents)
      .values({ organizationId: orgA, name: 'Vendas', slug: `kbrel-v-${runId}`, status: 'ACTIVE' })
      .returning();
    agentSales = sales!.id;
    // Uma seção por documento: o chunker corta por caracteres (até no meio de
    // palavras), então seções num único documento não teriam limites estáveis.
    for (const [i, section] of SECTIONS.entries()) await ingest(orgA, `secao-${i}.md`, section);
    await ingest(
      orgB,
      'helicopteros.md',
      'Helicóptero H-125 à venda. Preço do helicóptero sob consulta.',
    );
  });

  afterAll(async () => {
    try {
      await db.delete(knowledgeChunks).where(inArray(knowledgeChunks.organizationId, orgIds));
      await db.delete(knowledgeDocuments).where(inArray(knowledgeDocuments.organizationId, orgIds));
      await db.delete(agents).where(inArray(agents.organizationId, orgIds));
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
      const left = await db
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(inArray(knowledgeDocuments.organizationId, orgIds));
      expect(left).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });

  it('returns no evidence for a product the catalog does not mention (homologation case)', async () => {
    const result = await ask('preço do helicóptero');
    expect(result.hits).toEqual([]);
    expect(result.unmatchedTerms).toEqual(['helicoptero']);
  });

  it('does not let the company name or commercial words stand in for the missing product', async () => {
    for (const question of [
      'A Qualitec vende helicópteros?',
      'Qual o prazo de entrega do helicóptero?',
      'Vocês têm disponibilidade de helicóptero em estoque?',
    ]) {
      const result = await ask(question);
      expect(result.hits, question).toEqual([]);
    }
  });

  it('keeps the transmitter question answered by the transmitter excerpts', async () => {
    const result = await ask('Quais transmissores de pressão a Qualitec oferece?', 3);
    const top = result.hits
      .slice(0, 2)
      .map((h) => h.textSnapshot)
      .join(' ');
    expect(top).toContain('QT-310');
    expect(top).toContain('QT-520');
    expect(result.hits[0]!.relevance).toBe('DIRECT');
    expect(result.unmatchedTerms).toEqual([]);
  });

  it('answers a commercial question about a real product: product first, then the price FAQ as context', async () => {
    const result = await ask('Qual o preço do transmissor QT-310?');
    expect(result.hits[0]!.textSnapshot).toContain('QT-310');
    expect(result.hits[0]!.relevance).toBe('DIRECT');
    const faq = result.hits.find((h) => h.textSnapshot.includes('orçamento'));
    expect(faq?.relevance).toBe('CONTEXT');
    const firstContext = result.hits.findIndex((h) => h.relevance === 'CONTEXT');
    expect(result.hits.slice(0, firstContext).every((h) => h.relevance === 'DIRECT')).toBe(true);
  });

  it('answers purely commercial questions from the FAQ', async () => {
    const price = await ask('Como funcionam os preços?');
    expect(price.hits[0]!.textSnapshot).toContain('orçamento');
    const delivery = await ask('Qual o prazo de entrega?');
    expect(delivery.hits[0]!.textSnapshot).toContain('5 dias úteis');
  });

  it('does not reject a legitimate question because of an unknown word', async () => {
    const result = await ask('transmissor de pressão modelo zxqw');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.textSnapshot).toContain('Transmissor de Pressão');
    expect(result.unmatchedTerms).toEqual(['zxqw']);
  });

  it('keeps tenant isolation: another organization that sells helicopters is never used', async () => {
    const own = await ask('helicóptero H-125');
    expect(own.hits).toEqual([]);
    const other = await retrieval.retrieve({
      scope: { organizationId: orgB },
      query: { queryText: 'preço do helicóptero', topK: 5 },
    });
    expect(other.hits.length).toBe(1);
    expect(other.hits.every((h) => h.organizationId === orgB)).toBe(true);
  });

  it('respects the result limit across direct and context excerpts', async () => {
    const result = await ask('preço prazo transmissor válvula', 2);
    expect(result.hits).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('the offline preview shows no excerpt and names the missing term', async () => {
    const preview = new DrizzleKnowledgeRetrievalPreviewService(db);
    const result = await preview.preview({
      organizationId: orgA,
      queryText: 'preço do helicóptero',
    });
    expect(result).toMatchObject({
      hits: [],
      unmatchedTerms: ['helicoptero'],
      trust: 'UNTRUSTED_DATA',
    });
    const product = await preview.preview({
      organizationId: orgA,
      queryText: 'Qual o preço do transmissor QT-310?',
    });
    expect(product.hits[0]).toMatchObject({ relevance: 'DIRECT' });
    expect(product.hits.some((h) => h.relevance === 'CONTEXT')).toBe(true);
  });
});
