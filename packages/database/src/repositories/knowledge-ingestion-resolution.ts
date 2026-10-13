import {
  type IngestKnowledgeDocumentInput,
  type KnowledgeChunk,
  type KnowledgeChunkingPolicy,
  type KnowledgeDocument,
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  knowledgeChunkingPolicySchema,
} from '@voice-agent/contracts';
import { ConflictError } from '@voice-agent/errors';
import { getKnowledgeDocumentBySource } from './knowledge-document-repository.js';
import { getKnowledgeChunksByDocumentId } from './knowledge-chunk-repository.js';
import { chunkKnowledgeText } from './knowledge-chunker.js';
import type {
  IngestKnowledgeDocumentResult,
  PayloadEquivalenceScope,
  ResolveWinningOptions,
} from './knowledge-ingestion-types.js';

export function resolveEffectiveChunkingPolicy(
  input: IngestKnowledgeDocumentInput,
): KnowledgeChunkingPolicy {
  return knowledgeChunkingPolicySchema.parse(
    input.chunkingPolicy ?? {
      policyVersion: 'v1',
      maxChunkChars: KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
      overlapChars: KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
    },
  );
}

function normalizeOptionalScope(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function conflictFor(locator: string, detail: string): ConflictError {
  return new ConflictError(
    `Conflicting duplicate document source '${locator}' already exists with ${detail}`,
  );
}

function verifyEffectivePolicyEquivalent(locator: string, scope: PayloadEquivalenceScope): void {
  const { existingChunks, normalizedText, effectivePolicy } = scope;
  const policyMismatch = existingChunks.some(
    (chunk) => chunk.policyVersion !== effectivePolicy.policyVersion,
  );
  if (existingChunks.length === 0 || policyMismatch) {
    throw conflictFor(locator, 'a different effective chunking policy');
  }

  const recomputed = chunkKnowledgeText({
    text: normalizedText,
    documentId: '__equivalence_check__',
    policy: effectivePolicy,
  });
  const persisted = [...existingChunks].sort((a, b) => a.ordinal - b.ordinal);
  assertChunkIdentitiesEqual(persisted, recomputed, locator);
}

function assertChunkIdentitiesEqual(
  persisted: readonly KnowledgeChunk[],
  recomputed: ReadonlyArray<{
    readonly ordinal: number;
    readonly text: string;
    readonly contentIdentityValue: string;
  }>,
  locator: string,
): void {
  if (recomputed.length !== persisted.length) {
    throw conflictFor(locator, 'a different effective chunking policy');
  }
  for (const [index, expected] of recomputed.entries()) {
    const actual = persisted[index];
    if (
      !actual ||
      actual.ordinal !== expected.ordinal ||
      actual.contentIdentityValue !== expected.contentIdentityValue ||
      actual.text !== expected.text
    ) {
      throw conflictFor(locator, 'a different effective chunking policy');
    }
  }
}

export function verifyPayloadEquivalence(
  existing: KnowledgeDocument,
  input: IngestKnowledgeDocumentInput,
  scope: PayloadEquivalenceScope,
): void {
  const sameContent = existing.contentIdentity?.value === scope.contentHash;
  const sameTitle = existing.title === input.title;
  if (!sameContent || !sameTitle) {
    throw new ConflictError(
      `Conflicting duplicate document content identity '${scope.contentHash}' already exists for source '${input.source.locator}' with different title or content`,
    );
  }
  if (normalizeOptionalScope(existing.collection) !== normalizeOptionalScope(input.collection)) {
    throw conflictFor(input.source.locator, 'a different collection');
  }
  if (
    normalizeOptionalScope(existing.source.sourceVersion) !==
    normalizeOptionalScope(input.source.sourceVersion)
  ) {
    throw conflictFor(input.source.locator, 'a different source version');
  }
  if (normalizeOptionalScope(existing.agentId) !== normalizeOptionalScope(input.agentId)) {
    throw conflictFor(input.source.locator, 'a different agent association');
  }
  if (
    normalizeOptionalScope(existing.agentVersionId) !== normalizeOptionalScope(input.agentVersionId)
  ) {
    throw conflictFor(input.source.locator, 'a different agent version association');
  }
  verifyEffectivePolicyEquivalent(input.source.locator, scope);
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  );
}

export function isPostgresForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23503'
  );
}

export async function resolveWinningConcurrentDocument(
  options: ResolveWinningOptions,
): Promise<IngestKnowledgeDocumentResult> {
  const { db, orgId, input, contentHash } = options;
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const winning = await getKnowledgeDocumentBySource(db, {
      organizationId: orgId,
      sourceType: input.source.sourceType,
      sourceLocator: input.source.locator,
    });

    if (winning) {
      if (winning.status === 'READY') {
        const chunks = await getKnowledgeChunksByDocumentId(db, orgId, winning.id);
        verifyPayloadEquivalence(winning, input, {
          contentHash,
          existingChunks: chunks,
          normalizedText: options.normalizedText,
          effectivePolicy: options.effectivePolicy,
        });
        return { document: winning, chunks, isIdempotentDuplicate: true };
      }
      if (winning.status === 'FAILED' || winning.status === 'ARCHIVED') {
        throw new Error(
          `Concurrent knowledge document ingestion failed: existing document is in '${winning.status}' state`,
        );
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error(
    `Timed out waiting for concurrent ingestion of document source '${input.source.locator}' to become READY`,
  );
}
