import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import {
  ingestKnowledgeDocument,
  insertKnowledgeDocument,
  getKnowledgeDocumentById,
  updateKnowledgeDocumentStatus,
  listKnowledgeDocuments,
  getKnowledgeChunksByDocumentId,
  DrizzleKnowledgeRetrievalService,
  normalizeKnowledgeText,
  computeContentHash,
  chunkKnowledgeText,
} from './repositories/index.js';
import { organizations } from './schema/organizations.js';
import { knowledgeDocuments, knowledgeChunks } from './schema/knowledge.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Knowledge Base Persistence, Ingestion & Retrieval (007H Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const retrievalService = new DrizzleKnowledgeRetrievalService(db);

  const runId = Math.random().toString(36).substring(2, 8);
  let orgAId = '';
  let orgBId = '';
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const orgA = await orgRepo.createOrganization({
      slug: `kb-org-a-${runId}`,
      name: `KB Org A ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `kb-org-b-${runId}`,
      name: `KB Org B ${runId}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) throw new Error('Failed to create test organizations');

    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgAId, orgBId);
  });

  afterAll(async () => {
    try {
      if (createdOrgIds.length > 0) {
        await db
          .delete(knowledgeChunks)
          .where(inArray(knowledgeChunks.organizationId, createdOrgIds));
        await db
          .delete(knowledgeDocuments)
          .where(inArray(knowledgeDocuments.organizationId, createdOrgIds));
        await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
      }
    } finally {
      await pool.end();
    }
  });

  it('1. performs deterministic text normalization and Unicode NFC preservation', () => {
    const raw =
      '  Linha 1 \r\nLinha 2 com acentuação: devolução e preço.\r\n\r\n\r\n\r\nLinha 3.  \x00 ';
    const normalized = normalizeKnowledgeText(raw);

    expect(normalized).toBe('Linha 1\nLinha 2 com acentuação: devolução e preço.\n\nLinha 3.');
    expect(normalized.includes('\r')).toBe(false);
    expect(normalized.includes('\x00')).toBe(false);

    const hash1 = computeContentHash(normalized);
    const hash2 = computeContentHash(normalizeKnowledgeText(raw));
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('2. chunks text deterministically and computes stable chunk identities', () => {
    const text =
      'Primeiro parágrafo de teste sobre cancelamento de compras.\n\nSegundo parágrafo detalhando regras de estorno e prazos.';
    const policy = { policyVersion: 'v1', maxChunkChars: 65, overlapChars: 15 };

    const chunks = chunkKnowledgeText({
      text,
      documentId: '11111111-1111-4111-8111-111111111111',
      policy,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.ordinal).toBe(0);
    expect(chunks[1]?.ordinal).toBe(1);
    expect(chunks[0]?.chunkIdentity).toContain('11111111-1111-4111-8111-111111111111:v1:0:');
    expect(chunks[1]?.chunkIdentity).toContain('11111111-1111-4111-8111-111111111111:v1:1:');

    const chunksAgain = chunkKnowledgeText({
      text,
      documentId: '11111111-1111-4111-8111-111111111111',
      policy,
    });
    expect(chunksAgain).toEqual(chunks);
  });

  it('3. ingests document and chunks atomically, transitioning to READY', async () => {
    const rawText =
      'Os clientes têm direito ao arrependimento de compra em até 7 dias corridos após o recebimento do produto.';

    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Política de Devolução ${runId}`,
      source: {
        sourceType: 'POLICY',
        locator: 'docs/reembolso.md',
        sourceVersion: '1.0',
      },
      rawText,
      collection: 'customer-support',
    });

    expect(result.document.id).toBeDefined();
    expect(result.document.organizationId).toBe(orgAId);
    expect(result.document.status).toBe('READY');
    expect(result.document.collection).toBe('customer-support');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.isIdempotentDuplicate).toBe(false);

    const persistedDoc = await getKnowledgeDocumentById(db, orgAId, result.document.id);
    expect(persistedDoc).not.toBeNull();
    expect(persistedDoc?.status).toBe('READY');

    const persistedChunks = await getKnowledgeChunksByDocumentId(db, orgAId, result.document.id);
    expect(persistedChunks.length).toBe(result.chunks.length);
  });

  it('4. guarantees idempotency on identical re-ingestion and rejects conflicting duplicates', async () => {
    const rawText = `Texto específico para teste de idempotência ${runId}.`;

    const first = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Idempotência Teste ${runId}`,
      source: {
        sourceType: 'FAQ',
        locator: 'faq/idempotency.md',
      },
      rawText,
    });
    expect(first.isIdempotentDuplicate).toBe(false);

    const second = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Idempotência Teste ${runId}`,
      source: {
        sourceType: 'FAQ',
        locator: 'faq/idempotency.md',
      },
      rawText,
    });
    expect(second.isIdempotentDuplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);

    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Título Conflitante ${runId}`,
        source: {
          sourceType: 'FAQ',
          locator: 'faq/idempotency.md',
        },
        rawText,
      }),
    ).rejects.toThrow(/Conflicting duplicate document content identity/);
  });

  it('5. rejects empty documents and oversized text', async () => {
    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: 'Empty Doc',
        source: { sourceType: 'OTHER', locator: 'empty.txt' },
        rawText: '   \n\r\t  ',
      }),
    ).rejects.toThrow(/must not be empty/);

    const oversized = 'a'.repeat(200_001);
    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: 'Huge Doc',
        source: { sourceType: 'OTHER', locator: 'huge.txt' },
        rawText: oversized,
      }),
    ).rejects.toThrow(/exceeds maximum length/);
  });

  it('6. enforces strict multi-tenant boundary on retrieval', async () => {
    const textOrgA = `Manual exclusivo da Organização A com termo secreto alfa-${runId}.`;
    await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Manual A ${runId}`,
      source: { sourceType: 'PRODUCT_MANUAL', locator: 'org-a-manual.md' },
      rawText: textOrgA,
    });

    const resA = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: `secreto alfa-${runId}` },
    });
    expect(resA.hits.length).toBeGreaterThan(0);
    expect(resA.hits[0]?.textSnapshot).toContain(`alfa-${runId}`);

    const resB = await retrievalService.retrieve({
      scope: { organizationId: orgBId },
      query: { queryText: `secreto alfa-${runId}` },
    });
    expect(resB.hits).toHaveLength(0);
  });

  it('7. excludes non-READY documents from retrieval results', async () => {
    const uniqueTerm = `arqui${runId}token`;
    const textDraft = `Conteúdo que não deve aparecer após ser arquivado: ${uniqueTerm}.`;
    const ingested = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Documento Arquivado ${runId}`,
      source: { sourceType: 'SALES_SCRIPT', locator: 'script.md' },
      rawText: textDraft,
    });

    const readyRes = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: uniqueTerm },
    });
    expect(readyRes.hits.length).toBeGreaterThan(0);
    expect(readyRes.hits[0]?.documentId).toBe(ingested.document.id);

    await updateKnowledgeDocumentStatus(db, {
      organizationId: orgAId,
      documentId: ingested.document.id,
      nextStatus: 'ARCHIVED',
    });

    const archivedRes = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: uniqueTerm },
    });
    expect(archivedRes.hits).toHaveLength(0);
  });

  it('8. enforces access scope filters: collection, documentIds, sourceTypes', async () => {
    const textFinance = `Regras de faturamento e parcelamento fiscal ${runId}.`;
    const textSupport = `Regras de atendimento e suporte técnico ${runId}.`;

    const docFinance = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Financeiro ${runId}`,
      source: { sourceType: 'POLICY', locator: 'financeiro.md' },
      rawText: textFinance,
      collection: 'finance',
    });

    await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Suporte ${runId}`,
      source: { sourceType: 'FAQ', locator: 'suporte.md' },
      rawText: textSupport,
      collection: 'support',
    });

    const financeRes = await retrievalService.retrieve({
      scope: { organizationId: orgAId, collection: 'finance' },
      query: { queryText: `Regras ${runId}` },
    });
    expect(financeRes.hits.length).toBeGreaterThan(0);
    expect(financeRes.hits.every((h) => h.documentId === docFinance.document.id)).toBe(true);

    const faqRes = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: `Regras ${runId}`, sourceTypes: ['FAQ'] },
    });
    expect(faqRes.hits.length).toBeGreaterThan(0);
    expect(faqRes.hits.every((h) => h.citation.sourceType === 'FAQ')).toBe(true);

    const docIdRes = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: `Regras ${runId}`, documentIds: [docFinance.document.id] },
    });
    expect(docIdRes.hits.length).toBeGreaterThan(0);
    expect(docIdRes.hits.every((h) => h.documentId === docFinance.document.id)).toBe(true);
  });

  it('9. bounds retrieval query results and provides stable provenance and citations', async () => {
    const text = `Informação crucial de atendimento com múltiplos detalhes ${runId}.`;
    const doc = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Citações e Proveniência ${runId}`,
      source: { sourceType: 'OTHER', locator: 'citacao.txt' },
      rawText: text,
    });

    const res = await retrievalService.retrieve({
      scope: { organizationId: orgAId },
      query: { queryText: `Informação crucial atendimento ${runId}`, topK: 1 },
    });

    expect(res.hits.length).toBe(1);
    const hit = res.hits[0]!;

    expect(hit.citation.documentId).toBe(doc.document.id);
    expect(hit.citation.sourceLocator).toBe('citacao.txt');
    expect(hit.citation.sourceType).toBe('OTHER');
    expect(hit.citation.chunkOrdinal).toBe(0);

    expect(hit.provenance.organizationId).toBe(orgAId);
    expect(hit.provenance.documentId).toBe(doc.document.id);
    expect(hit.provenance.policyVersion).toBe('v1');
    expect(hit.provenance.contentIdentityValue).toBeDefined();

    expect(hit.score).toBeGreaterThan(0);
    expect(hit.score).toBeLessThanOrEqual(1.0);
  });

  it('10. lists knowledge documents with tenant isolation and status filters', async () => {
    const list = await listKnowledgeDocuments(db, orgAId, { limit: 10 });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((d) => d.organizationId === orgAId)).toBe(true);

    const listB = await listKnowledgeDocuments(db, orgBId);
    expect(listB.every((d) => d.organizationId === orgBId)).toBe(true);
  });

  it('11. guarantees atomic transactional rollback on failure leaving zero remnants', async () => {
    const rollbackTitle = `Documento Rollback ${runId}`;

    await expect(
      db.transaction(async (tx) => {
        await insertKnowledgeDocument(tx, {
          organizationId: orgAId,
          title: rollbackTitle,
          source: { sourceType: 'POLICY', locator: 'rollback.txt' },
        });
        throw new Error('Simulated ingestion failure triggering rollback');
      }),
    ).rejects.toThrow('Simulated ingestion failure triggering rollback');

    const docs = await listKnowledgeDocuments(db, orgAId);
    expect(docs.some((d) => d.title === rollbackTitle)).toBe(false);
  });

  it('12. handles concurrent identical ingestions safely: produces exactly one durable document and one chunk set without duplicates', async () => {
    const rawText = `Texto concorrente idêntico para validação de corrida ${runId}.`;
    const locator = `concurrent/identical-${runId}.md`;

    const [res1, res2] = await Promise.all([
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Concorrência Idêntica ${runId}`,
        source: { sourceType: 'POLICY', locator },
        rawText,
      }),
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Concorrência Idêntica ${runId}`,
        source: { sourceType: 'POLICY', locator },
        rawText,
      }),
    ]);

    expect(res1.document.id).toBe(res2.document.id);
    expect(res1.document.status).toBe('READY');
    expect(res2.document.status).toBe('READY');

    const duplicateFlags = [res1.isIdempotentDuplicate, res2.isIdempotentDuplicate];
    expect(duplicateFlags).toContain(false);
    expect(duplicateFlags).toContain(true);

    const persistedDocs = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, orgAId),
          eq(knowledgeDocuments.sourceLocator, locator),
        ),
      );
    expect(persistedDocs).toHaveLength(1);

    const persistedChunks = await getKnowledgeChunksByDocumentId(db, orgAId, res1.document.id);
    expect(persistedChunks.length).toBe(res1.chunks.length);
  });

  it('13. handles concurrent conflicting ingestion deterministically without raw DB error leak', async () => {
    const locator = `concurrent/conflicting-${runId}.md`;

    const results = await Promise.allSettled([
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Título Original ${runId}`,
        source: { sourceType: 'FAQ', locator },
        rawText: `Conteúdo original ${runId}.`,
      }),
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Título Divergente ${runId}`,
        source: { sourceType: 'FAQ', locator },
        rawText: `Conteúdo divergente ${runId}.`,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(error.message).toMatch(/Conflicting duplicate document/);
    expect(error.message.includes('23505')).toBe(false);

    const persistedDocs = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, orgAId),
          eq(knowledgeDocuments.sourceLocator, locator),
        ),
      );
    expect(persistedDocs).toHaveLength(1);
  });

  it('14. permits same source identity across different tenants and identical content across different sources', async () => {
    const sharedLocator = `cross-tenant/shared-${runId}.md`;
    const sharedText = `Texto idêntico compartilhado em múltiplas fontes ${runId}.`;

    const [docOrgA, docOrgB] = await Promise.all([
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Doc Org A ${runId}`,
        source: { sourceType: 'PRODUCT_MANUAL', locator: sharedLocator },
        rawText: sharedText,
      }),
      ingestKnowledgeDocument(db, {
        organizationId: orgBId,
        title: `Doc Org B ${runId}`,
        source: { sourceType: 'PRODUCT_MANUAL', locator: sharedLocator },
        rawText: sharedText,
      }),
    ]);

    expect(docOrgA.document.id).not.toBe(docOrgB.document.id);
    expect(docOrgA.document.organizationId).toBe(orgAId);
    expect(docOrgB.document.organizationId).toBe(orgBId);

    const source1Locator = `multi-source/doc1-${runId}.md`;
    const source2Locator = `multi-source/doc2-${runId}.md`;

    const [doc1, doc2] = await Promise.all([
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Doc 1 ${runId}`,
        source: { sourceType: 'FAQ', locator: source1Locator },
        rawText: sharedText,
      }),
      ingestKnowledgeDocument(db, {
        organizationId: orgAId,
        title: `Doc 2 ${runId}`,
        source: { sourceType: 'POLICY', locator: source2Locator },
        rawText: sharedText,
      }),
    ]);

    expect(doc1.document.id).not.toBe(doc2.document.id);
    expect(doc1.document.source.locator).toBe(source1Locator);
    expect(doc2.document.source.locator).toBe(source2Locator);
    expect(doc1.document.contentIdentity?.value).toBe(doc2.document.contentIdentity?.value);
  });
});
