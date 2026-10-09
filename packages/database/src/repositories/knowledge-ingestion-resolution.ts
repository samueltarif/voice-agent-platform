import type { KnowledgeDocument } from '@voice-agent/contracts';
import { getKnowledgeDocumentBySource } from './knowledge-document-repository.js';
import { getKnowledgeChunksByDocumentId } from './knowledge-chunk-repository.js';
import type {
  IngestKnowledgeDocumentInput,
  IngestKnowledgeDocumentResult,
  ResolveWinningOptions,
} from './knowledge-ingestion-types.js';

export function verifyPayloadEquivalence(
  existing: KnowledgeDocument,
  input: IngestKnowledgeDocumentInput,
  contentHash: string,
): void {
  const sameContent = existing.contentIdentity?.value === contentHash;
  const sameTitle = existing.title === input.title;
  if (!sameContent || !sameTitle) {
    throw new Error(
      `Conflicting duplicate document content identity '${contentHash}' already exists for source '${input.source.locator}' with different title or content`,
    );
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
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
        verifyPayloadEquivalence(winning, input, contentHash);
        const chunks = await getKnowledgeChunksByDocumentId(db, orgId, winning.id);
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
