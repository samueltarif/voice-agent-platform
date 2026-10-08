import { describe, it, expect } from 'vitest';
import {
  isValidDocumentStatusTransition,
  validateDocumentStatusTransition,
  createKnowledgeDocumentInputSchema,
} from './knowledge-document-contracts.js';
import {
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  buildStableChunkIdentity,
  knowledgeChunkingPolicySchema,
  knowledgeChunkSchema,
} from './knowledge-chunk-contracts.js';
import { knowledgeAccessScopeSchema } from './knowledge-access-scope-contracts.js';
import {
  KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K,
  KNOWLEDGE_RETRIEVAL_MAX_TOP_K,
  knowledgeCitationSchema,
  knowledgeRetrievalQuerySchema,
} from './knowledge-retrieval-contracts.js';
import * as knowledgeExports from './index.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const CHUNK = '33333333-3333-4333-8333-333333333333';

describe('Knowledge Base domain contracts (007G)', () => {
  it('allows valid document lifecycle transitions', () => {
    expect(isValidDocumentStatusTransition('PENDING', 'PROCESSING')).toBe(true);
    expect(isValidDocumentStatusTransition('PROCESSING', 'READY')).toBe(true);
    expect(isValidDocumentStatusTransition('PROCESSING', 'FAILED')).toBe(true);
    expect(isValidDocumentStatusTransition('READY', 'ARCHIVED')).toBe(true);
    expect(isValidDocumentStatusTransition('FAILED', 'ARCHIVED')).toBe(true);
    expect(isValidDocumentStatusTransition('PENDING', 'PENDING')).toBe(true);
  });

  it('rejects invalid document lifecycle transitions', () => {
    expect(isValidDocumentStatusTransition('PENDING', 'READY')).toBe(false);
    expect(isValidDocumentStatusTransition('READY', 'PROCESSING')).toBe(false);
    expect(isValidDocumentStatusTransition('FAILED', 'READY')).toBe(false);
    expect(isValidDocumentStatusTransition('ARCHIVED', 'READY')).toBe(false);
    expect(isValidDocumentStatusTransition('READY', 'FAILED')).toBe(false);
    expect(() => validateDocumentStatusTransition('PENDING', 'READY')).toThrow(
      /Invalid knowledge document status transition/,
    );
  });

  it('requires tenant-scoped document identity', () => {
    const valid = createKnowledgeDocumentInputSchema.safeParse({
      organizationId: ORG,
      title: 'Refund policy',
      source: { sourceType: 'POLICY', locator: 's3://bucket/policy-v3.pdf' },
    });
    expect(valid.success).toBe(true);

    expect(
      createKnowledgeDocumentInputSchema.safeParse({
        title: 'Missing tenant',
        source: { sourceType: 'POLICY', locator: 'loc' },
      }).success,
    ).toBe(false);

    expect(
      createKnowledgeDocumentInputSchema.safeParse({
        organizationId: 'not-a-uuid',
        title: 'Bad tenant',
        source: { sourceType: 'POLICY', locator: 'loc' },
      }).success,
    ).toBe(false);
  });

  it('enforces stable source provenance structure on chunks', () => {
    const valid = knowledgeChunkSchema.safeParse({
      id: CHUNK,
      organizationId: ORG,
      documentId: DOC,
      ordinal: 0,
      text: 'Refunds are processed within 7 days.',
      policyVersion: 'v1',
    });
    expect(valid.success).toBe(true);

    expect(
      knowledgeChunkSchema.safeParse({
        id: CHUNK,
        documentId: DOC,
        ordinal: 0,
        text: 'Missing tenant scope',
        policyVersion: 'v1',
      }).success,
    ).toBe(false);
  });

  it('bounds retrieval limits with deterministic defaults', () => {
    expect(KNOWLEDGE_RETRIEVAL_MAX_TOP_K).toBe(20);
    expect(KNOWLEDGE_RETRIEVAL_DEFAULT_TOP_K).toBe(5);

    const defaults = knowledgeRetrievalQuerySchema.safeParse({ queryText: 'refund deadline?' });
    expect(defaults.success).toBe(true);
    if (defaults.success) expect(defaults.data.topK).toBe(5);

    for (const topK of [0, -3, 21, 100]) {
      expect(knowledgeRetrievalQuerySchema.safeParse({ queryText: 'q', topK }).success).toBe(false);
    }
  });

  it('requires citation and source reference fields', () => {
    const valid = knowledgeCitationSchema.safeParse({
      documentId: DOC,
      chunkId: CHUNK,
      sourceType: 'POLICY',
      sourceLocator: 's3://bucket/policy-v3.pdf',
      chunkOrdinal: 2,
    });
    expect(valid.success).toBe(true);

    expect(
      knowledgeCitationSchema.safeParse({
        documentId: DOC,
        chunkId: CHUNK,
        sourceType: 'POLICY',
        chunkOrdinal: 2,
      }).success,
    ).toBe(false);
  });

  it('builds deterministic stable chunk identities', () => {
    const input = {
      documentId: DOC,
      policyVersion: 'v1',
      ordinal: 3,
      contentIdentityValue: 'abc123',
    };
    expect(buildStableChunkIdentity(input)).toBe(buildStableChunkIdentity({ ...input }));
    expect(buildStableChunkIdentity({ ...input, ordinal: 4 })).not.toBe(
      buildStableChunkIdentity(input),
    );
    expect(KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS).toBe(2000);
    expect(knowledgeChunkingPolicySchema.safeParse({ policyVersion: 'v1' }).success).toBe(true);
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 500,
        overlapChars: 500,
      }).success,
    ).toBe(false);
  });

  it('keeps public contracts provider-neutral', () => {
    const names = Object.keys(knowledgeExports).join(' ').toLowerCase();
    for (const provider of ['openai', 'pinecone', 'qdrant', 'weaviate', 'pgvector', 'supabase']) {
      expect(names).not.toContain(provider);
    }
    expect(
      knowledgeRetrievalQuerySchema.safeParse({
        queryText: 'q',
        openaiModel: 'gpt-6-astra',
      } as unknown as Record<string, unknown>).success,
    ).toBe(false);
  });

  it('resolves server-side access scope without tenant override from text', () => {
    const scoped = knowledgeAccessScopeSchema.safeParse({ organizationId: ORG });
    expect(scoped.success).toBe(true);
    expect(knowledgeAccessScopeSchema.safeParse({}).success).toBe(false);
    expect(
      knowledgeAccessScopeSchema.safeParse({
        organizationId: ORG,
        role: 'ADMIN',
      } as unknown as Record<string, unknown>).success,
    ).toBe(false);
  });
});
