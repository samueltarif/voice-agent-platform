import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { InvalidStateTransitionError, NotFoundError } from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import {
  ingestKnowledgeDocument,
  getKnowledgeDocumentById,
  updateKnowledgeDocumentStatus,
  DrizzleKnowledgeRepository,
} from './repositories/index.js';
import { knowledgeDocuments, knowledgeChunks } from './schema/knowledge.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Knowledge Document Archive Concurrency & State Invariants (Postgres Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const knowledgeRepo = new DrizzleKnowledgeRepository(db);

  const runId = Math.random().toString(36).substring(2, 8);
  let orgAId = '';
  let orgBId = '';
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const orgA = await orgRepo.createOrganization({
      slug: `kb-concurrent-a-${runId}`,
      name: `KB Concurrent A ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `kb-concurrent-b-${runId}`,
      name: `KB Concurrent B ${runId}`,
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
      }
    } finally {
      await pool.end();
    }
  });

  it('handles concurrent archive requests deterministically: exactly one succeeds and one receives conflict', async () => {
    const ingested = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Concurrent Archive Document ${runId}`,
      source: { sourceType: 'POLICY', locator: `policy-concurrent-${runId}.md` },
      rawText: `Concurrent archive test content ${runId}.`,
    });
    expect(ingested.document.status).toBe('READY');

    const req1 = knowledgeRepo.archiveDocument(orgAId, ingested.document.id);
    const req2 = knowledgeRepo.archiveDocument(orgAId, ingested.document.id);

    const results = await Promise.allSettled([req1, req2]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const fulfilled = (successes[0] as PromiseFulfilledResult<{ status: string }>).value;
    expect(fulfilled.status).toBe('ARCHIVED');

    const rejected = (failures[0] as PromiseRejectedResult).reason;
    expect(rejected).toBeInstanceOf(InvalidStateTransitionError);

    // Final database status check: document is ARCHIVED
    const docInDb = await getKnowledgeDocumentById(db, orgAId, ingested.document.id);
    expect(docInDb?.status).toBe('ARCHIVED');
  });

  it('rejects cross-tenant archive attempts and preserves document status', async () => {
    const ingested = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Tenant Isolation Archive Document ${runId}`,
      source: { sourceType: 'POLICY', locator: `policy-isolation-${runId}.md` },
      rawText: `Tenant isolation test content ${runId}.`,
    });
    expect(ingested.document.status).toBe('READY');

    // Org B attempts to archive Org A's document
    await expect(knowledgeRepo.archiveDocument(orgBId, ingested.document.id)).rejects.toThrow(
      NotFoundError,
    );

    // Org A's document status remains intact (READY)
    const docInDb = await getKnowledgeDocumentById(db, orgAId, ingested.document.id);
    expect(docInDb?.status).toBe('READY');
  });

  it('strictly rejects sequential invalid transitions on an archived document', async () => {
    const ingested = await ingestKnowledgeDocument(db, {
      organizationId: orgAId,
      title: `Sequential Invalid Transitions Document ${runId}`,
      source: { sourceType: 'POLICY', locator: `policy-seq-invalid-${runId}.md` },
      rawText: `Sequential invalid transitions content ${runId}.`,
    });

    const archived = await knowledgeRepo.archiveDocument(orgAId, ingested.document.id);
    expect(archived.status).toBe('ARCHIVED');

    // Attempting to archive an already archived document sequentially is rejected
    await expect(knowledgeRepo.archiveDocument(orgAId, ingested.document.id)).rejects.toThrow(
      InvalidStateTransitionError,
    );

    // Attempting transition from ARCHIVED to READY is rejected
    await expect(
      updateKnowledgeDocumentStatus(db, {
        organizationId: orgAId,
        documentId: ingested.document.id,
        nextStatus: 'READY',
      }),
    ).rejects.toThrow(InvalidStateTransitionError);

    // Document in DB remains ARCHIVED
    const docInDb = await getKnowledgeDocumentById(db, orgAId, ingested.document.id);
    expect(docInDb?.status).toBe('ARCHIVED');
  });
});
