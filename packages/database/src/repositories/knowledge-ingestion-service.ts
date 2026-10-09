import {
  type CreateKnowledgeDocumentInput,
  type KnowledgeChunkingPolicy,
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  createKnowledgeDocumentInputSchema,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import {
  KNOWLEDGE_DOCUMENT_MAX_CHARS,
  computeContentHash,
  normalizeKnowledgeText,
} from './knowledge-text-normalizer.js';
import { chunkKnowledgeText } from './knowledge-chunker.js';
import {
  getKnowledgeDocumentBySource,
  insertKnowledgeDocument,
  updateKnowledgeDocumentStatus,
} from './knowledge-document-repository.js';
import {
  getKnowledgeChunksByDocumentId,
  insertKnowledgeChunks,
} from './knowledge-chunk-repository.js';
import type {
  IngestKnowledgeDocumentInput,
  IngestKnowledgeDocumentResult,
  TransactionalIngestionOptions,
} from './knowledge-ingestion-types.js';
import {
  isPostgresUniqueViolation,
  resolveWinningConcurrentDocument,
  verifyPayloadEquivalence,
} from './knowledge-ingestion-resolution.js';

export * from './knowledge-ingestion-types.js';
export * from './knowledge-ingestion-resolution.js';

function validateAndNormalize(input: IngestKnowledgeDocumentInput): {
  normalizedText: string;
  contentHash: string;
} {
  if (typeof input.rawText !== 'string' || input.rawText.trim().length === 0) {
    throw new Error('Knowledge document rawText must not be empty');
  }
  if (input.rawText.length > KNOWLEDGE_DOCUMENT_MAX_CHARS) {
    throw new Error(
      `Knowledge document rawText exceeds maximum length of ${KNOWLEDGE_DOCUMENT_MAX_CHARS} characters`,
    );
  }

  const normalizedText = normalizeKnowledgeText(input.rawText);
  if (normalizedText.length === 0) {
    throw new Error('Knowledge document rawText is empty after normalization');
  }

  const contentHash = computeContentHash(normalizedText);
  return { normalizedText, contentHash };
}

async function executeTransactionalIngestion(
  options: TransactionalIngestionOptions,
): Promise<IngestKnowledgeDocumentResult | null> {
  const { db, input, documentInput, normalizedText } = options;
  const policy: KnowledgeChunkingPolicy = input.chunkingPolicy ?? {
    policyVersion: 'v1',
    maxChunkChars: KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
    overlapChars: KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  };

  try {
    return await db.transaction(async (tx) => {
      const doc = await insertKnowledgeDocument(tx, documentInput, {
        initialStatus: 'PENDING',
        onConflictDoNothing: true,
      });
      if (!doc) return null;

      await updateKnowledgeDocumentStatus(tx, {
        organizationId: input.organizationId,
        documentId: doc.id,
        nextStatus: 'PROCESSING',
      });

      const preparedChunks = chunkKnowledgeText({
        text: normalizedText,
        documentId: doc.id,
        policy,
      });

      const insertedChunks = await insertKnowledgeChunks(
        tx,
        preparedChunks.map((c) => ({
          organizationId: input.organizationId,
          documentId: doc.id,
          ordinal: c.ordinal,
          text: c.text,
          policyVersion: c.policyVersion,
          contentIdentityValue: c.contentIdentityValue,
          chunkIdentity: c.chunkIdentity,
        })),
      );

      const readyDoc = await updateKnowledgeDocumentStatus(tx, {
        organizationId: input.organizationId,
        documentId: doc.id,
        nextStatus: 'READY',
      });

      return { document: readyDoc, chunks: insertedChunks, isIdempotentDuplicate: false };
    });
  } catch (error: unknown) {
    if (isPostgresUniqueViolation(error)) return null;
    throw error;
  }
}

export async function ingestKnowledgeDocument(
  db: DatabaseInstance,
  input: IngestKnowledgeDocumentInput,
): Promise<IngestKnowledgeDocumentResult> {
  const { normalizedText, contentHash } = validateAndNormalize(input);

  const documentInput: CreateKnowledgeDocumentInput = createKnowledgeDocumentInputSchema.parse({
    organizationId: input.organizationId,
    title: input.title,
    source: input.source,
    contentIdentity: { algorithm: 'sha256', value: contentHash },
    collection: input.collection,
    agentId: input.agentId,
    agentVersionId: input.agentVersionId,
  });

  const existing = await getKnowledgeDocumentBySource(db, {
    organizationId: input.organizationId,
    sourceType: input.source.sourceType,
    sourceLocator: input.source.locator,
  });
  if (existing && existing.status === 'READY') {
    verifyPayloadEquivalence(existing, input, contentHash);
    const existingChunks = await getKnowledgeChunksByDocumentId(
      db,
      input.organizationId,
      existing.id,
    );
    return { document: existing, chunks: existingChunks, isIdempotentDuplicate: true };
  }

  const result = await executeTransactionalIngestion({
    db,
    input,
    documentInput,
    normalizedText,
  });

  if (result) return result;

  return resolveWinningConcurrentDocument({
    db,
    orgId: input.organizationId,
    input,
    contentHash,
  });
}
