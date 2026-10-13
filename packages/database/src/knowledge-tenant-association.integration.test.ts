import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { NotFoundError, BadRequestError, ConflictError } from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import {
  ingestKnowledgeDocument,
  getKnowledgeDocumentBySource,
  DrizzleKnowledgeRetrievalService,
} from './repositories/index.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';
import { knowledgeDocuments, knowledgeChunks } from './schema/knowledge.js';
import { user } from './schema/auth.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Knowledge Tenant-Safe Associations & Idempotency Scope (007J Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);

  const runId = Math.random().toString(36).substring(2, 8);
  const userId = `usr-kb-tenant-${runId}`;
  let orgAId = '';
  let orgBId = '';
  let agentAId = '';
  let agentA2Id = '';
  let versionA1Id = '';
  let agentBId = '';
  let versionB1Id = '';
  const createdOrgIds: string[] = [];

  async function insertAgent(orgId: string, name: string) {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name, slug: `${name}-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('Failed to create agent fixture');
    return agent;
  }

  async function insertVersion(orgId: string, agentId: string, versionNumber: number) {
    const [version] = await db
      .insert(agentVersions)
      .values({
        organizationId: orgId,
        agentId,
        versionNumber,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: { prompt: `kb fixture ${runId}`, tools: [] },
        createdBy: userId,
        publishedAt: new Date(),
        publishedBy: userId,
      })
      .returning();
    if (!version) throw new Error('Failed to create version fixture');
    return version;
  }

  beforeAll(async () => {
    await db.insert(user).values({
      id: userId,
      name: `KB Tenant Tester ${runId}`,
      email: `kb-tenant-${runId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const orgA = await orgRepo.createOrganization({
      slug: `kb-tenant-a-${runId}`,
      name: `KB Tenant A ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `kb-tenant-b-${runId}`,
      name: `KB Tenant B ${runId}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) throw new Error('Failed to create test organizations');
    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgAId, orgBId);

    const agentA = await insertAgent(orgAId, 'kb-agent-a');
    agentAId = agentA.id;
    const agentA2 = await insertAgent(orgAId, 'kb-agent-a2');
    agentA2Id = agentA2.id;
    versionA1Id = (await insertVersion(orgAId, agentAId, 1)).id;

    const agentB = await insertAgent(orgBId, 'kb-agent-b');
    agentBId = agentB.id;
    versionB1Id = (await insertVersion(orgBId, agentBId, 1)).id;
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
        await db.delete(agentVersions).where(inArray(agentVersions.organizationId, createdOrgIds));
        await db.delete(agents).where(inArray(agents.organizationId, createdOrgIds));
        await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));

        const leftovers = await db
          .select({ id: knowledgeDocuments.id })
          .from(knowledgeDocuments)
          .where(inArray(knowledgeDocuments.organizationId, createdOrgIds));
        expect(leftovers).toHaveLength(0);
      }
      await db.delete(user).where(inArray(user.id, [userId]));
    } finally {
      await pool.end();
    }
  });

  function baseInput(locator: string, rawText: string) {
    return {
      organizationId: orgAId,
      title: `Tenant Doc ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
    };
  }

  // --- HIGH-1: tenant-safe agent references ---

  it('accepts an own-tenant agent association', async () => {
    const result = await ingestKnowledgeDocument(
      db,
      baseInput(`tenant/own-agent-${runId}.md`, `Own-tenant agent association ${runId}.`),
    );
    const withAgent = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/own-agent2-${runId}.md`, `Own-tenant agent association two ${runId}.`),
      agentId: agentAId,
    });
    expect(result.isIdempotentDuplicate).toBe(false);
    expect(withAgent.document.agentId).toBe(agentAId);
  });

  it('accepts an own-tenant agent version matching the supplied agent', async () => {
    const result = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/own-version-${runId}.md`, `Own-tenant version association ${runId}.`),
      agentId: agentAId,
      agentVersionId: versionA1Id,
    });
    expect(result.document.agentId).toBe(agentAId);
    expect(result.document.agentVersionId).toBe(versionA1Id);
  });

  it('rejects a foreign agent reference without persisting the document', async () => {
    const locator = `tenant/foreign-agent-${runId}.md`;
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, `Foreign agent reference ${runId}.`),
        agentId: agentBId,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(
      await getKnowledgeDocumentBySource(db, {
        organizationId: orgAId,
        sourceType: 'POLICY',
        sourceLocator: locator,
      }),
    ).toBeNull();
  });

  it('rejects a foreign version reference without persisting the document', async () => {
    const locator = `tenant/foreign-version-${runId}.md`;
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, `Foreign version reference ${runId}.`),
        agentId: agentAId,
        agentVersionId: versionB1Id,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(
      await getKnowledgeDocumentBySource(db, {
        organizationId: orgAId,
        sourceType: 'POLICY',
        sourceLocator: locator,
      }),
    ).toBeNull();
  });

  it('rejects a version that belongs to a different agent of the same tenant', async () => {
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(
          `tenant/mismatched-version-${runId}.md`,
          `Mismatched version reference ${runId}.`,
        ),
        agentId: agentA2Id,
        agentVersionId: versionA1Id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects nonexistent references with the same shape as foreign references', async () => {
    const ghostAgent = randomUUID();
    const ghostVersion = randomUUID();
    const foreignError = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/shape-a-${runId}.md`, `Shape probe A ${runId}.`),
      agentId: agentBId,
    }).catch((error: unknown) => error);
    const ghostError = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/shape-b-${runId}.md`, `Shape probe B ${runId}.`),
      agentId: ghostAgent,
      agentVersionId: ghostVersion,
    }).catch((error: unknown) => error);

    expect(foreignError).toBeInstanceOf(NotFoundError);
    expect(ghostError).toBeInstanceOf(NotFoundError);
    expect((ghostError as Error).message).toBe((foreignError as Error).message);
  });

  it('rejects a version reference without agent context fail-closed', async () => {
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(`tenant/version-without-agent-${runId}.md`, `Version without agent ${runId}.`),
        agentVersionId: versionA1Id,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('persists no cross-tenant agent association from rejected ingestions', async () => {
    const rows = await db
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(inArray(knowledgeDocuments.organizationId, [orgAId]));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      const docs = await db
        .select({
          agentId: knowledgeDocuments.agentId,
          agentVersionId: knowledgeDocuments.agentVersionId,
        })
        .from(knowledgeDocuments)
        .where(inArray(knowledgeDocuments.id, ids));
      for (const doc of docs) {
        expect(doc.agentId === null || doc.agentId === undefined || doc.agentId !== agentBId).toBe(
          true,
        );
        expect(
          doc.agentVersionId === null ||
            doc.agentVersionId === undefined ||
            doc.agentVersionId !== versionB1Id,
        ).toBe(true);
      }
    }
  });

  // --- MEDIUM-3: idempotency scope safety ---

  it('treats an identical replay with identical scope as a duplicate', async () => {
    const locator = `tenant/idem-scope-${runId}.md`;
    const payload = {
      ...baseInput(locator, `Identical scope replay payload ${runId}.`),
      collection: 'support',
      agentId: agentAId,
      agentVersionId: versionA1Id,
      source: {
        sourceType: 'POLICY' as const,
        locator,
        sourceVersion: '3.2',
      },
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    };
    const first = await ingestKnowledgeDocument(db, payload);
    expect(first.isIdempotentDuplicate).toBe(false);
    const second = await ingestKnowledgeDocument(db, payload);
    expect(second.isIdempotentDuplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
  });

  it('conflicts when the same source replays with a different title', async () => {
    const locator = `tenant/idem-title-${runId}.md`;
    const rawText = `Title scope payload ${runId}.`;
    await ingestKnowledgeDocument(db, { ...baseInput(locator, rawText), title: `A ${runId}` });
    await expect(
      ingestKnowledgeDocument(db, { ...baseInput(locator, rawText), title: `B ${runId}` }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with different text', async () => {
    const locator = `tenant/idem-text-${runId}.md`;
    await ingestKnowledgeDocument(db, baseInput(locator, `Original text scope ${runId}.`));
    await expect(
      ingestKnowledgeDocument(db, baseInput(locator, `Altered text scope ${runId}.`)),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with a different collection', async () => {
    const locator = `tenant/idem-collection-${runId}.md`;
    const rawText = `Collection scope payload ${runId}.`;
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      collection: 'support',
    });
    await expect(
      ingestKnowledgeDocument(db, { ...baseInput(locator, rawText), collection: 'finance' }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with a different agent', async () => {
    const locator = `tenant/idem-agent-${runId}.md`;
    const rawText = `Agent scope payload ${runId}.`;
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      agentId: agentAId,
    });
    await expect(
      ingestKnowledgeDocument(db, { ...baseInput(locator, rawText), agentId: agentA2Id }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with a different agent version', async () => {
    const locator = `tenant/idem-version-${runId}.md`;
    const rawText = `Version scope payload ${runId}.`;
    const versionA2 = await db
      .insert(agentVersions)
      .values({
        organizationId: orgAId,
        agentId: agentAId,
        versionNumber: 2,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { prompt: `kb fixture v2 ${runId}`, tools: [] },
        createdBy: userId,
      })
      .returning();
    const versionA2Id = versionA2[0]?.id;
    if (!versionA2Id) throw new Error('Failed to create second version fixture');
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      agentId: agentAId,
      agentVersionId: versionA1Id,
    });
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, rawText),
        agentId: agentAId,
        agentVersionId: versionA2Id,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with a different source version', async () => {
    const locator = `tenant/idem-source-version-${runId}.md`;
    const rawText = `Source version scope payload ${runId}.`;
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      source: { sourceType: 'POLICY', locator, sourceVersion: '1.0' },
    });
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, rawText),
        source: { sourceType: 'POLICY', locator, sourceVersion: '2.0' },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts when the same source replays with a different effective chunking policy', async () => {
    const locator = `tenant/idem-policy-${runId}.md`;
    const rawText = `Policy scope payload ${runId}.`;
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    });
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, rawText),
        chunkingPolicy: { policyVersion: 'v2-custom', maxChunkChars: 2000, overlapChars: 200 },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('conflicts on effective chunking drift under an identical policy version', async () => {
    const locator = `tenant/idem-policy-drift-${runId}.md`;
    const paragraphs = Array.from(
      { length: 12 },
      (_, index) =>
        `Parágrafo ${index} sobre procedimentos operacionais padrão com detalhes extensos para forçar múltiplos chunks determinísticos ${runId}.`,
    );
    const rawText = paragraphs.join('\n\n');
    await ingestKnowledgeDocument(db, {
      ...baseInput(locator, rawText),
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 500, overlapChars: 50 },
    });
    await expect(
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, rawText),
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 500, overlapChars: 150 },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('keeps concurrent identical ingestions safe with a single persisted document', async () => {
    const locator = `tenant/idem-concurrent-same-${runId}.md`;
    const rawText = `Concurrent identical payload ${runId}.`;
    const settled = await Promise.allSettled([
      ingestKnowledgeDocument(db, baseInput(locator, rawText)),
      ingestKnowledgeDocument(db, baseInput(locator, rawText)),
    ]);
    const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled).toHaveLength(2);
    const ids = fulfilled.map((entry) =>
      entry.status === 'fulfilled' ? entry.value.document.id : undefined,
    );
    expect(ids[0]).toBe(ids[1]);
    const duplicates = fulfilled.filter(
      (entry) => entry.status === 'fulfilled' && entry.value.isIdempotentDuplicate,
    );
    expect(duplicates).toHaveLength(1);
  });

  it('keeps concurrent conflicting ingestions from silently succeeding', async () => {
    const locator = `tenant/idem-concurrent-diff-${runId}.md`;
    const settled = await Promise.allSettled([
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, `Concurrent scope A ${runId}.`),
        title: `Concurrent A ${runId}`,
      }),
      ingestKnowledgeDocument(db, {
        ...baseInput(locator, `Concurrent scope B ${runId}.`),
        title: `Concurrent B ${runId}`,
      }),
    ]);
    const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
    const rejected = settled.filter((entry) => entry.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  // --- Published-agent retrieval independence (real service, no human RBAC) ---

  it('retrieves bound and unbound documents under a trusted published-agent scope', async () => {
    const term = `handoff independence ${runId}`;
    const bound = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-bound-${runId}.md`, `Bound retrieval content ${term}.`),
      agentId: agentAId,
      agentVersionId: versionA1Id,
    });
    const unbound = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-open-${runId}.md`, `Open retrieval content ${term}.`),
    });
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    const result = await retrieval.retrieve({
      scope: { organizationId: orgAId, agentId: agentAId, agentVersionId: versionA1Id },
      query: { queryText: term },
    });
    const ids = result.hits.map((hit) => hit.documentId);
    expect(ids).toContain(bound.document.id);
    expect(ids).toContain(unbound.document.id);
  });

  it('excludes another agents documents from an agent-scoped retrieval', async () => {
    const term = `agent scoping ${runId}`;
    const boundToA = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-scoped-${runId}.md`, `Agent A scoped content ${term}.`),
      agentId: agentAId,
      agentVersionId: versionA1Id,
    });
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    const result = await retrieval.retrieve({
      scope: { organizationId: orgAId, agentId: agentA2Id },
      query: { queryText: term },
    });
    const ids = result.hits.map((hit) => hit.documentId);
    expect(ids).not.toContain(boundToA.document.id);
  });

  it('returns no cross-organization hits for a foreign published-agent scope', async () => {
    const term = `foreign handoff ${runId}`;
    await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-foreign-${runId}.md`, `Foreign handoff content ${term}.`),
      agentId: agentAId,
      agentVersionId: versionA1Id,
    });
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    const result = await retrieval.retrieve({
      scope: { organizationId: orgBId, agentId: agentBId, agentVersionId: versionB1Id },
      query: { queryText: term },
    });
    expect(result.hits).toHaveLength(0);
  });

  it('restricts collection-scoped agent retrieval to its collection', async () => {
    const term = `collection handoff ${runId}`;
    const faqDoc = await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-faq-${runId}.md`, `FAQ handoff content ${term}.`),
      collection: 'faq-only',
    });
    await ingestKnowledgeDocument(db, {
      ...baseInput(`tenant/handoff-internal-${runId}.md`, `Internal handoff content ${term}.`),
      collection: 'internal-policy',
    });
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    const result = await retrieval.retrieve({
      scope: {
        organizationId: orgAId,
        agentId: agentAId,
        agentVersionId: versionA1Id,
        collection: 'faq-only',
      },
      query: { queryText: term },
    });
    const ids = result.hits.map((hit) => hit.documentId);
    expect(ids).toContain(faqDoc.document.id);
    for (const hit of result.hits) {
      expect(hit.citation.sourceLocator).toContain('handoff-faq');
    }
  });
});
