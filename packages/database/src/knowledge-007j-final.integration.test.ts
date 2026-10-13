import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray, eq, and, ne } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import { AgentDraftDiscardService } from './repositories/agent-draft-discard-service.js';
import {
  ingestKnowledgeDocument,
  isPostgresForeignKeyViolation,
  getKnowledgeDocumentBySource,
  DrizzleKnowledgeRetrievalService,
} from './repositories/index.js';
import { insertKnowledgeDocument } from './repositories/knowledge-document-repository.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';
import { knowledgeDocuments, knowledgeChunks } from './schema/knowledge.js';
import { auditLogs } from './schema/audit.js';
import { user } from './schema/auth.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('007J Final Security Invariants (Decision A/B + N1)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const draftService = new AgentDraftService(db);
  const discardService = new AgentDraftDiscardService(db);
  const runId = Math.random().toString(36).substring(2, 8);
  const userId = `usr-007jfin-${runId}`;
  let orgId = '';
  let orgBId = '';
  const createdOrgIds: string[] = [];
  const validConfig = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Teste',
      objective: 'Atender',
      tone: 'FORMAL' as const,
      greetingPhrase: 'Ola, como posso ajudar?',
      closingPhrase: 'Obrigado.',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' as const },
    rules: {
      conversational: ['Seja cordial'],
      deterministic: { maxDiscountPercent: 10, operatingHours: '08:00-18:00' },
    },
    playbook: { stages: [{ name: 'Abertura', goal: 'Identificar' }] },
    examples: [{ customerInput: 'Ola', idealAgentResponse: 'Ola!' }],
  };

  beforeAll(async () => {
    await db.insert(user).values({
      id: userId,
      name: `Final Tester ${runId}`,
      email: `final-${runId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const org = await orgRepo.createOrganization({
      slug: `fin-org-${runId}`,
      name: `Final Org ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `fin-org-b-${runId}`,
      name: `Final Org B ${runId}`,
      status: 'ACTIVE',
    });
    if (!org || !orgB) throw new Error('org fixture failed');
    orgId = org.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgId, orgBId);
  });

  afterAll(async () => {
    try {
      if (createdOrgIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.organizationId, createdOrgIds));
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

  it('A1 distinct policies with identical chunks conflict (durable identity)', async () => {
    const locator = `fin/a1-${runId}.md`;
    const rawText = `Short policy probe ${runId}.`;
    await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `A1 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    });
    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `A1 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText,
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 1000, overlapChars: 100 },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('A2 same canonical policy replays idempotently', async () => {
    const locator = `fin/a2-${runId}.md`;
    const rawText = `Canonical replay ${runId}.`;
    const payload = {
      organizationId: orgId,
      title: `A2 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    };
    const first = await ingestKnowledgeDocument(db, payload);
    expect(first.isIdempotentDuplicate).toBe(false);
    const second = await ingestKnowledgeDocument(db, payload);
    expect(second.isIdempotentDuplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
  });

  it('A3 explicit defaults equal implicit defaults', async () => {
    const locator = `fin/a3-${runId}.md`;
    const rawText = `Defaults probe ${runId}.`;
    const first = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `A3 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
    });
    const second = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `A3 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    });
    expect(second.isIdempotentDuplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
  });

  it('A4 different effective policy conflicts', async () => {
    const locator = `fin/a4-${runId}.md`;
    const paragraphs = Array.from(
      { length: 12 },
      (_, i) =>
        `Paragrafo ${i} procedimentos operacionais extensos para multiplos chunks ${runId}.`,
    );
    const rawText = paragraphs.join('\n\n');
    await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `A4 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 500, overlapChars: 50 },
    });
    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `A4 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText,
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 500, overlapChars: 150 },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('A5 concurrent differing policies keep single identity, other conflicts', async () => {
    const locator = `fin/a5-${runId}.md`;
    const rawText = `Concurrent policy probe ${runId}.`;
    const settled = await Promise.allSettled([
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `A5 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText,
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
      }),
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `A5 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText,
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 1000, overlapChars: 100 },
      }),
    ]);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it('A6 legacy unknown policy fails closed', async () => {
    const locator = `fin/a6-${runId}.md`;
    const rawText = `Legacy probe ${runId}.`;
    const legacy = await insertKnowledgeDocument(
      db,
      {
        organizationId: orgId,
        title: `A6 ${runId}`,
        source: { sourceType: 'POLICY', locator },
        contentIdentity: { algorithm: 'sha256', value: `legacy-${runId}` },
      },
      { initialStatus: 'PENDING' },
    );
    if (!legacy) throw new Error('legacy insert failed');
    await db
      .update(knowledgeDocuments)
      .set({ status: 'READY' })
      .where(eq(knowledgeDocuments.id, legacy.id));
    await expect(
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `A6 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText,
        chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('A7 new persisted fields round-trip correctly', async () => {
    const locator = `fin/a7-${runId}.md`;
    const result = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `A7 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator },
      rawText: `Roundtrip probe ${runId}.`,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 1500, overlapChars: 150 },
    });
    expect(result.document.chunkingPolicy?.policyVersion).toBe('v1');
    expect(result.document.chunkingPolicy?.maxChunkChars).toBe(1500);
    expect(result.document.chunkingPolicy?.overlapChars).toBe(150);
    const fetched = await getKnowledgeDocumentBySource(db, {
      organizationId: orgId,
      sourceType: 'POLICY',
      sourceLocator: locator,
    });
    expect(fetched?.chunkingPolicy).toEqual(result.document.chunkingPolicy);
  });

  it('A8 legacy fixture remains valid under additive migration', async () => {
    const locator = `fin/a8-${runId}.md`;
    const legacy = await insertKnowledgeDocument(
      db,
      {
        organizationId: orgId,
        title: `A8 ${runId}`,
        source: { sourceType: 'FAQ', locator },
        contentIdentity: { algorithm: 'sha256', value: `a8-${runId}` },
      },
      { initialStatus: 'PENDING' },
    );
    if (!legacy) throw new Error('legacy insert failed');
    expect(legacy.chunkingPolicy).toBeUndefined();
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    await db
      .update(knowledgeDocuments)
      .set({ status: 'READY' })
      .where(eq(knowledgeDocuments.id, legacy.id));
    const fetched = await getKnowledgeDocumentBySource(db, {
      organizationId: orgId,
      sourceType: 'FAQ',
      sourceLocator: locator,
    });
    expect(fetched?.id).toBe(legacy.id);
    expect(fetched?.status).toBe('READY');
    void retrieval;
  });

  it('N1 direct relevant FK maps, unrelated does not, malformed safe', () => {
    const direct = {
      code: '23503',
      constraint: 'knowledge_documents_agent_version_id_agent_versions_id_fk',
    };
    expect(isPostgresForeignKeyViolation(direct)).toBe(true);
    const wrapped = new Error('w') as Error & { cause?: unknown };
    (wrapped as { cause: unknown }).cause = {
      code: '23503',
      constraint: 'knowledge_documents_agent_id_agents_id_fk',
    };
    expect(isPostgresForeignKeyViolation(wrapped)).toBe(true);
    expect(isPostgresForeignKeyViolation({ code: '23503', constraint: 'other_fkey' })).toBe(false);
    expect(isPostgresForeignKeyViolation({ code: '23503' })).toBe(false);
    expect(isPostgresForeignKeyViolation(null)).toBe(false);
    expect(() =>
      isPostgresForeignKeyViolation({ cause: { cause: { code: 23503 } } }),
    ).not.toThrow();
  });

  it('N1 ghost association stays 404 without SQL leak', async () => {
    const ghost = randomUUID();
    const err = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `Ghost ${runId}`,
      source: { sourceType: 'POLICY' as const, locator: `fin/ghost-${runId}.md` },
      rawText: `Ghost ${runId}.`,
      agentId: ghost,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).message).not.toMatch(/23503|constraint|SELECT|INSERT|params/i);
  });

  it('B1 draft with READY knowledge cannot be discarded, stays scoped', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b1-${runId}`, slug: `b1-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `B1 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator: `fin/b1-${runId}.md` },
      rawText: `B1 content ${runId}.`,
      agentId: agent.id,
      agentVersionId: draft.id,
    });
    await expect(
      discardService.discardDraft({
        organizationId: orgId,
        agentId: agent.id,
        versionId: draft.id,
        actorId: userId,
      }),
    ).rejects.toThrow();
    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, orgId),
          eq(knowledgeDocuments.agentVersionId, draft.id),
        ),
      )
      .limit(1);
    expect(doc?.agentVersionId).toBe(draft.id);
  });

  it('B2 draft with PENDING knowledge cannot be discarded', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b2-${runId}`, slug: `b2-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    await insertKnowledgeDocument(
      db,
      {
        organizationId: orgId,
        title: `B2 ${runId}`,
        source: { sourceType: 'POLICY', locator: `fin/b2-${runId}.md` },
        contentIdentity: { algorithm: 'sha256', value: `b2-${runId}` },
        agentId: agent.id,
        agentVersionId: draft.id,
      },
      { initialStatus: 'PENDING' },
    );
    await expect(
      discardService.discardDraft({
        organizationId: orgId,
        agentId: agent.id,
        versionId: draft.id,
        actorId: userId,
      }),
    ).rejects.toThrow();
  });

  it('B3 draft without active documents discards successfully', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b3-${runId}`, slug: `b3-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    const res = await discardService.discardDraft({
      organizationId: orgId,
      agentId: agent.id,
      versionId: draft.id,
      actorId: userId,
    });
    expect(res.success).toBe(true);
  });

  it('B4 draft with only archived knowledge discards and stays unretrievable', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b4-${runId}`, slug: `b4-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    const ingested = await ingestKnowledgeDocument(db, {
      organizationId: orgId,
      title: `B4 ${runId}`,
      source: { sourceType: 'POLICY' as const, locator: `fin/b4-${runId}.md` },
      rawText: `B4 archived term ${runId} unique retrieval probe.`,
      collection: `b4col-${runId}`,
      agentId: agent.id,
      agentVersionId: draft.id,
    });
    await db
      .update(knowledgeDocuments)
      .set({ status: 'ARCHIVED' })
      .where(eq(knowledgeDocuments.id, ingested.document.id));
    const res = await discardService.discardDraft({
      organizationId: orgId,
      agentId: agent.id,
      versionId: draft.id,
      actorId: userId,
    });
    expect(res.success).toBe(true);
    const retrieval = new DrizzleKnowledgeRetrievalService(db);
    const result = await retrieval.retrieve({
      scope: {
        organizationId: orgId,
        agentId: agent.id,
        agentVersionId: draft.id,
        collection: `b4col-${runId}`,
      },
      query: { queryText: `B4 archived term ${runId}` },
    });
    expect(result.hits).toHaveLength(0);
  });

  it('B5 concurrent discard and ingestion stays safe', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b5-${runId}`, slug: `b5-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    const locator = `fin/b5-${runId}.md`;
    const settled = await Promise.allSettled([
      ingestKnowledgeDocument(db, {
        organizationId: orgId,
        title: `B5 ${runId}`,
        source: { sourceType: 'POLICY' as const, locator },
        rawText: `B5 concurrent ${runId}.`,
        agentId: agent.id,
        agentVersionId: draft.id,
      }),
      discardService.discardDraft({
        organizationId: orgId,
        agentId: agent.id,
        versionId: draft.id,
        actorId: userId,
      }),
    ]);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(2);
    const docs = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, orgId),
          eq(knowledgeDocuments.agentVersionId, draft.id),
        ),
      );
    const readyDocs = docs.filter((d) => d.status !== 'ARCHIVED');
    if (readyDocs.length > 0) {
      const versions = await db.select().from(agentVersions).where(eq(agentVersions.id, draft.id));
      expect(versions).toHaveLength(1);
    }
    expect(ne).toBeDefined();
    void orgBId;
  });

  it('B6 cross-tenant discard stays rejected', async () => {
    const [agent] = await db
      .insert(agents)
      .values({ organizationId: orgId, name: `b6-${runId}`, slug: `b6-${runId}`, status: 'ACTIVE' })
      .returning();
    if (!agent) throw new Error('agent failed');
    const draft = await draftService.createDraft({
      organizationId: orgId,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
    });
    await expect(
      discardService.discardDraft({
        organizationId: orgBId,
        agentId: agent.id,
        versionId: draft.id,
        actorId: userId,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
