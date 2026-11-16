import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { NotFoundError } from '@voice-agent/errors';
import type { KnowledgeDocument } from '@voice-agent/contracts';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import {
  DrizzleKnowledgeManagementService,
  DrizzleKnowledgeRepository,
  DrizzleKnowledgeRetrievalService,
  deleteKnowledgeChunksByDocumentId,
  getKnowledgeChunksByDocumentId,
  ingestKnowledgeDocument,
} from './repositories/index.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';
import { knowledgeDocuments, knowledgeChunks } from './schema/knowledge.js';
import { auditLogs } from './schema/audit.js';
import { user } from './schema/auth.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

/** DEC-054: gestão da Base de Conhecimento — edição, associação, restauração, exclusão. */
describe('Knowledge management (DEC-054 integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const management = new DrizzleKnowledgeManagementService(db);
  const repo = new DrizzleKnowledgeRepository(db);
  const retrieval = new DrizzleKnowledgeRetrievalService(db);
  const runId = Math.random().toString(36).substring(2, 8);
  const actorId = `usr-kb-manage-${runId}`;
  const orgIds: string[] = [];
  let orgA = '';
  let orgB = '';
  let agentA = '';
  let agentA2 = '';
  let archivedAgentA = '';
  let agentB = '';
  let versionA = '';
  let seq = 0;

  async function insertAgent(orgId: string, name: string, status: 'ACTIVE' | 'ARCHIVED') {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name, slug: `${name}-${runId}`, status })
      .returning();
    return agent!.id;
  }

  async function ingest(overrides: Partial<{ agentId: string; agentVersionId: string }> = {}) {
    seq += 1;
    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgA,
      title: `Doc ${seq} ${runId}`,
      source: { sourceType: 'FAQ', locator: `manage/${runId}/${seq}.md` },
      rawText: `Conteudo original numero ${seq} sobre valvulas ${runId}.`,
      ...overrides,
    });
    return result.document;
  }

  function actor(doc: KnowledgeDocument, orgId = orgA) {
    return {
      organizationId: orgId,
      documentId: doc.id,
      actorId,
      expectedUpdatedAt: doc.updatedAt.toISOString(),
    };
  }

  async function auditActions(documentId: string): Promise<string[]> {
    const rows = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, documentId), eq(auditLogs.organizationId, orgA)))
      .orderBy(asc(auditLogs.createdAt));
    return rows.map((r) => r.action);
  }

  beforeAll(async () => {
    const orgRepo = new OrganizationRepository(db);
    await db.insert(user).values({
      id: actorId,
      name: `KB Manage ${runId}`,
      email: `kb-manage-${runId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const a = await orgRepo.createOrganization({
      slug: `kbm-a-${runId}`,
      name: 'A',
      status: 'ACTIVE',
    });
    const b = await orgRepo.createOrganization({
      slug: `kbm-b-${runId}`,
      name: 'B',
      status: 'ACTIVE',
    });
    orgA = a!.id;
    orgB = b!.id;
    orgIds.push(orgA, orgB);
    agentA = await insertAgent(orgA, 'kbm-a', 'ACTIVE');
    agentA2 = await insertAgent(orgA, 'kbm-a2', 'ACTIVE');
    archivedAgentA = await insertAgent(orgA, 'kbm-arch', 'ARCHIVED');
    agentB = await insertAgent(orgB, 'kbm-b', 'ACTIVE');
    const [version] = await db
      .insert(agentVersions)
      .values({
        organizationId: orgA,
        agentId: agentA,
        versionNumber: 1,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: { prompt: `kbm ${runId}`, tools: [] },
        createdBy: actorId,
        publishedAt: new Date(),
        publishedBy: actorId,
      })
      .returning();
    versionA = version!.id;
  });

  afterAll(async () => {
    try {
      await db.delete(auditLogs).where(inArray(auditLogs.organizationId, orgIds));
      await db.delete(knowledgeChunks).where(inArray(knowledgeChunks.organizationId, orgIds));
      await db.delete(knowledgeDocuments).where(inArray(knowledgeDocuments.organizationId, orgIds));
      await db.delete(agentVersions).where(inArray(agentVersions.organizationId, orgIds));
      await db.delete(agents).where(inArray(agents.organizationId, orgIds));
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
      await db.delete(user).where(eq(user.id, actorId));
      const leftovers = await db
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(inArray(knowledgeDocuments.organizationId, orgIds));
      expect(leftovers).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });

  it('edits title, collection and source version, advancing the concurrency token', async () => {
    const doc = await ingest();
    const updated = await management.updateDocument({
      ...actor(doc),
      title: '  Catálogo editado  ',
      collection: 'oleo-gas',
      sourceVersion: 'rev-2',
    });
    expect(updated).toMatchObject({ title: 'Catálogo editado', collection: 'oleo-gas' });
    expect(updated.source.sourceVersion).toBe('rev-2');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(doc.updatedAt.getTime());
    const cleared = await management.updateDocument({ ...actor(updated), collection: null });
    expect(cleared.collection).toBeUndefined();
    expect(await auditActions(doc.id)).toEqual([
      'knowledge.document_updated',
      'knowledge.document_updated',
    ]);
  });

  it('replaces the content atomically: old text is gone, new text is retrievable', async () => {
    const doc = await ingest();
    const updated = await management.updateDocument({
      ...actor(doc),
      rawText: `Novo texto sobre compressores ${runId}.`,
    });
    expect(updated.contentIdentity?.value).not.toBe(doc.contentIdentity?.value);
    const chunks = await getKnowledgeChunksByDocumentId(db, orgA, doc.id);
    expect(chunks.map((c) => c.text).join(' ')).toContain('compressores');
    expect(chunks.map((c) => c.text).join(' ')).not.toContain('valvulas');
    const hits = await retrieval.retrieve({
      scope: { organizationId: orgA },
      query: { queryText: `compressores ${runId}`, documentIds: [doc.id] },
    });
    expect(hits.hits).toHaveLength(1);
    const [audit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, doc.id));
    expect(audit!.metadata).not.toContain('compressores');
  });

  it('rejects a stale update and leaves the document unchanged', async () => {
    const doc = await ingest();
    await management.updateDocument({ ...actor(doc), title: 'primeira' });
    await expect(
      management.updateDocument({ ...actor(doc), title: 'segunda' }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_STALE_UPDATE', statusCode: 409 });
    expect((await repo.getDocumentById(orgA, doc.id))!.title).toBe('primeira');
  });

  it('serializes concurrent edits with the same token: exactly one wins', async () => {
    const doc = await ingest();
    const results = await Promise.allSettled([
      management.updateDocument({ ...actor(doc), title: 'x' }),
      management.updateDocument({ ...actor(doc), title: 'y' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'KNOWLEDGE_STALE_UPDATE' });
  });

  it('rejects an update without changes', async () => {
    const doc = await ingest();
    await expect(management.updateDocument(actor(doc))).rejects.toMatchObject({
      code: 'KNOWLEDGE_NO_CHANGES',
      statusCode: 400,
    });
  });

  it('never reaches a document of another organization', async () => {
    const doc = await ingest();
    await expect(
      management.updateDocument({ ...actor(doc, orgB), title: 'invasão' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      management.setDocumentAgent({ ...actor(doc, orgB), agentId: agentB }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.archiveDocument(orgB, doc.id, actorId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(management.deleteDocument(actor(doc, orgB))).rejects.toBeInstanceOf(NotFoundError);
    expect((await repo.getDocumentById(orgA, doc.id))!.status).toBe('READY');
  });

  it('associates to an agent of the same organization and scopes retrieval', async () => {
    const doc = await ingest();
    const linked = await management.setDocumentAgent({ ...actor(doc), agentId: agentA });
    expect(linked.agentId).toBe(agentA);
    const query = { queryText: `valvulas ${runId}`, documentIds: [doc.id] };
    const own = await retrieval.retrieve({
      scope: { organizationId: orgA, agentId: agentA },
      query,
    });
    const other = await retrieval.retrieve({
      scope: { organizationId: orgA, agentId: agentA2 },
      query,
    });
    expect(own.hits).toHaveLength(1);
    expect(other.hits).toHaveLength(0);
    const shared = await management.setDocumentAgent({ ...actor(linked), agentId: null });
    expect(shared.agentId).toBeUndefined();
    const again = await retrieval.retrieve({
      scope: { organizationId: orgA, agentId: agentA2 },
      query,
    });
    expect(again.hits).toHaveLength(1);
    expect(await auditActions(doc.id)).toEqual([
      'knowledge.document_agent_changed',
      'knowledge.document_agent_changed',
    ]);
  });

  it('rejects agents from another organization, archived agents and no-op associations', async () => {
    const doc = await ingest();
    await expect(
      management.setDocumentAgent({ ...actor(doc), agentId: agentB }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_AGENT_UNAVAILABLE' });
    await expect(
      management.setDocumentAgent({ ...actor(doc), agentId: archivedAgentA }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_AGENT_UNAVAILABLE' });
    await expect(
      management.setDocumentAgent({ ...actor(doc), agentId: null }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_NO_CHANGES' });
    expect((await repo.getDocumentById(orgA, doc.id))!.agentId).toBeUndefined();
  });

  it('keeps documents pinned to an agent version immutable except for archiving', async () => {
    const doc = await ingest({ agentId: agentA, agentVersionId: versionA });
    await expect(
      management.updateDocument({ ...actor(doc), rawText: 'mudança silenciosa' }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_PINNED_TO_AGENT_VERSION' });
    await expect(
      management.setDocumentAgent({ ...actor(doc), agentId: agentA2 }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_PINNED_TO_AGENT_VERSION' });
    const archived = await repo.archiveDocument(orgA, doc.id, actorId);
    await expect(management.deleteDocument(actor(archived))).rejects.toMatchObject({
      code: 'KNOWLEDGE_DOCUMENT_IN_USE',
    });
    const chunks = await getKnowledgeChunksByDocumentId(db, orgA, doc.id);
    expect(chunks.map((c) => c.text).join(' ')).toContain('valvulas');
  });

  it('archives with audit and restores to READY with the same content', async () => {
    const doc = await ingest();
    const archived = await repo.archiveDocument(orgA, doc.id, actorId);
    expect(archived.status).toBe('ARCHIVED');
    const restored = await management.restoreDocument(actor(archived));
    expect(restored.status).toBe('READY');
    expect(restored.contentIdentity).toEqual(doc.contentIdentity);
    await expect(management.restoreDocument(actor(restored))).rejects.toMatchObject({
      code: 'KNOWLEDGE_NOT_RESTORABLE',
    });
    expect(await auditActions(doc.id)).toEqual([
      'knowledge.document_archived',
      'knowledge.document_restored',
    ]);
  });

  it('refuses to restore an archived document whose content is gone', async () => {
    const doc = await ingest();
    const archived = await repo.archiveDocument(orgA, doc.id, actorId);
    await deleteKnowledgeChunksByDocumentId(db, orgA, doc.id);
    await expect(management.restoreDocument(actor(archived))).rejects.toMatchObject({
      code: 'KNOWLEDGE_NOT_RESTORABLE',
    });
    expect((await repo.getDocumentById(orgA, doc.id))!.status).toBe('ARCHIVED');
  });

  it('keeps archive without actor unaudited (existing callers unchanged)', async () => {
    const doc = await ingest();
    await repo.archiveDocument(orgA, doc.id);
    expect(await auditActions(doc.id)).toEqual([]);
  });

  it('deletes only archived, unassociated documents; audit remains and the source is free', async () => {
    const doc = await ingest();
    await expect(management.deleteDocument(actor(doc))).rejects.toMatchObject({
      code: 'KNOWLEDGE_NOT_EDITABLE',
    });
    const linked = await management.setDocumentAgent({ ...actor(doc), agentId: agentA });
    const archivedLinked = await repo.archiveDocument(orgA, linked.id, actorId);
    await expect(management.deleteDocument(actor(archivedLinked))).rejects.toMatchObject({
      code: 'KNOWLEDGE_DOCUMENT_IN_USE',
    });

    const free = await ingest();
    const archived = await repo.archiveDocument(orgA, free.id, actorId);
    await management.deleteDocument(actor(archived));
    expect(await repo.getDocumentById(orgA, free.id)).toBeNull();
    expect(await getKnowledgeChunksByDocumentId(db, orgA, free.id)).toHaveLength(0);
    expect(await auditActions(free.id)).toEqual([
      'knowledge.document_archived',
      'knowledge.document_deleted',
    ]);
    const recreated = await ingestKnowledgeDocument(db, {
      organizationId: orgA,
      title: 'recriado',
      source: free.source,
      rawText: 'Conteudo recriado depois da exclusao.',
    });
    expect(recreated.document.id).not.toBe(free.id);
  });

  it('does not edit or associate archived documents', async () => {
    const doc = await ingest();
    const archived = await repo.archiveDocument(orgA, doc.id, actorId);
    await expect(
      management.updateDocument({ ...actor(archived), title: 'novo' }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_NOT_EDITABLE' });
    await expect(
      management.setDocumentAgent({ ...actor(archived), agentId: agentA }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_NOT_EDITABLE' });
  });
});
