import {
  type CreateKnowledgeDocumentInput,
  createKnowledgeDocumentInputSchema,
  toPolicyIdentity,
} from '@voice-agent/contracts';
import { NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { validateAndNormalizeKnowledgeText } from './knowledge-text-normalizer.js';
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
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
  resolveEffectiveChunkingPolicy,
  resolveWinningConcurrentDocument,
  verifyPayloadEquivalence,
} from './knowledge-ingestion-resolution.js';
import {
  AGENT_ASSOCIATION_NOT_FOUND_MESSAGE,
  validateAgentAssociation,
} from './knowledge-agent-association.js';
import { lockReferencedVersion } from './knowledge-version-lock.js';

export * from './knowledge-ingestion-types.js';
export * from './knowledge-ingestion-resolution.js';

async function executeTransactionalIngestion(
  options: TransactionalIngestionOptions,
): Promise<IngestKnowledgeDocumentResult | null> {
  const { db, input, documentInput, normalizedText, effectivePolicy } = options;

  try {
    return await db.transaction(async (tx) => {
      await lockReferencedVersion(tx, input);
      const doc = await insertKnowledgeDocument(tx, documentInput, {
        initialStatus: 'PENDING',
        onConflictDoNothing: true,
        policyIdentity: toPolicyIdentity(effectivePolicy),
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
        policy: effectivePolicy,
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
    if (isPostgresForeignKeyViolation(error)) {
      throw new NotFoundError(AGENT_ASSOCIATION_NOT_FOUND_MESSAGE);
    }
    if (isPostgresUniqueViolation(error)) return null;
    throw error;
  }
}

async function ingestFreshDocument(
  options: TransactionalIngestionOptions & { contentHash: string },
): Promise<IngestKnowledgeDocumentResult> {
  const { db, input, documentInput, normalizedText, contentHash, effectivePolicy } = options;
  const result = await executeTransactionalIngestion({
    db,
    input,
    documentInput,
    normalizedText,
    effectivePolicy,
  });
  if (result) return result;
  return resolveWinningConcurrentDocument({
    db,
    orgId: input.organizationId,
    input,
    contentHash,
    normalizedText,
    effectivePolicy,
  });
}

export async function ingestKnowledgeDocument(
  db: DatabaseInstance,
  input: IngestKnowledgeDocumentInput,
): Promise<IngestKnowledgeDocumentResult> {
  const { normalizedText, contentHash } = validateAndNormalizeKnowledgeText(input.rawText);
  const effectivePolicy = resolveEffectiveChunkingPolicy(input);
  await validateAgentAssociation(db, {
    organizationId: input.organizationId,
    agentId: input.agentId,
    agentVersionId: input.agentVersionId,
  });

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
    const existingChunks = await getKnowledgeChunksByDocumentId(
      db,
      input.organizationId,
      existing.id,
    );
    verifyPayloadEquivalence(existing, input, {
      contentHash,
      existingChunks,
      normalizedText,
      effectivePolicy,
    });
    return { document: existing, chunks: existingChunks, isIdempotentDuplicate: true };
  }

  return ingestFreshDocument({
    db,
    input,
    documentInput,
    normalizedText,
    contentHash,
    effectivePolicy,
  });
}
