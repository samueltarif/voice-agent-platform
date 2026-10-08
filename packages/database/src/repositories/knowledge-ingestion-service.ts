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
  getKnowledgeDocumentByContentIdentity,
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
  DuplicateCheckOptions,
  TransactionalIngestionOptions,
} from './knowledge-ingestion-types.js';

export * from './knowledge-ingestion-types.js';

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

async function checkExistingDuplicate(
  options: DuplicateCheckOptions,
): Promise<IngestKnowledgeDocumentResult | null> {
  const { db, orgId, contentHash, documentInput } = options;
  const existing = await getKnowledgeDocumentByContentIdentity(db, orgId, contentHash);
  if (!existing) return null;

  const sameMetadata =
    existing.title === documentInput.title &&
    existing.source.locator === documentInput.source.locator &&
    existing.source.sourceType === documentInput.source.sourceType;

  if (!sameMetadata) {
    throw new Error(
      `Conflicting duplicate document content identity '${contentHash}' already exists with different title or source`,
    );
  }

  const existingChunks = await getKnowledgeChunksByDocumentId(db, orgId, existing.id);
  return { document: existing, chunks: existingChunks, isIdempotentDuplicate: true };
}

async function executeTransactionalIngestion(
  options: TransactionalIngestionOptions,
): Promise<IngestKnowledgeDocumentResult> {
  const { db, input, documentInput, normalizedText } = options;
  const policy: KnowledgeChunkingPolicy = input.chunkingPolicy ?? {
    policyVersion: 'v1',
    maxChunkChars: KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
    overlapChars: KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  };

  return db.transaction(async (tx) => {
    const doc = await insertKnowledgeDocument(tx, documentInput, {
      initialStatus: 'PENDING',
    });

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

  const duplicateResult = await checkExistingDuplicate({
    db,
    orgId: input.organizationId,
    contentHash,
    documentInput,
  });
  if (duplicateResult) return duplicateResult;

  return executeTransactionalIngestion({
    db,
    input,
    documentInput,
    normalizedText,
  });
}
