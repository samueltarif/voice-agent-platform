import {
  type IngestKnowledgeDocumentInput,
  type KnowledgeChunkingPolicy,
  type KnowledgeDocument,
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  arePolicyIdentitiesEqual,
  isUnknownPolicyIdentity,
  knowledgeChunkingPolicySchema,
  toPolicyIdentity,
} from '@voice-agent/contracts';
import { ConflictError } from '@voice-agent/errors';
import { getKnowledgeDocumentBySource } from './knowledge-document-repository.js';
import { getKnowledgeChunksByDocumentId } from './knowledge-chunk-repository.js';
import type {
  IngestKnowledgeDocumentResult,
  PayloadEquivalenceScope,
  ResolveWinningOptions,
} from './knowledge-ingestion-types.js';
import { findDriverError } from './postgres-driver-error.js';

const RELEVANT_KNOWLEDGE_FK_CONSTRAINTS = new Set([
  'knowledge_documents_agent_id_agents_id_fk',
  'knowledge_documents_agent_version_id_agent_versions_id_fk',
]);

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

function verifyEffectivePolicyEquivalent(
  existing: KnowledgeDocument,
  effectivePolicy: KnowledgeChunkingPolicy,
  locator: string,
): void {
  const stored = existing.chunkingPolicy;
  if (!stored || isUnknownPolicyIdentity(stored)) {
    throw conflictFor(locator, 'an unknown effective chunking policy');
  }
  const incoming = toPolicyIdentity(effectivePolicy);
  const persisted = toPolicyIdentity(stored);
  if (!arePolicyIdentitiesEqual(persisted, incoming)) {
    throw conflictFor(locator, 'a different effective chunking policy');
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
  verifyEffectivePolicyEquivalent(existing, scope.effectivePolicy, input.source.locator);
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  const driver = findDriverError(error, 5);
  return driver !== null && driver.code === '23505';
}

export function isPostgresForeignKeyViolation(error: unknown): boolean {
  const driver = findDriverError(error, 5);
  if (driver === null || driver.code !== '23503') return false;
  const constraint = driver.constraint;
  return typeof constraint === 'string' && RELEVANT_KNOWLEDGE_FK_CONSTRAINTS.has(constraint);
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
        throw new ConflictError(
          `Concurrent knowledge document ingestion failed: existing document is in '${winning.status}' state`,
        );
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new ConflictError(
    `Concurrent knowledge document ingestion failed: timed out waiting for source '${input.source.locator}'`,
  );
}
