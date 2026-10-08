import { and, asc, desc, eq } from 'drizzle-orm';
import {
  type CreateKnowledgeDocumentInput,
  type KnowledgeDocument,
  type KnowledgeDocumentStatus,
  validateDocumentStatusTransition,
} from '@voice-agent/contracts';
import { knowledgeDocuments } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapKnowledgeDocument } from './knowledge-mapping.js';

export interface InsertKnowledgeDocumentOptions {
  readonly initialStatus?: KnowledgeDocumentStatus | undefined;
  readonly errorMessage?: string | undefined;
}

export async function insertKnowledgeDocument(
  db: DatabaseExecutor,
  input: CreateKnowledgeDocumentInput,
  options: InsertKnowledgeDocumentOptions = {},
): Promise<KnowledgeDocument> {
  const [row] = await db
    .insert(knowledgeDocuments)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      sourceType: input.source.sourceType,
      sourceLocator: input.source.locator,
      sourceVersion: input.source.sourceVersion,
      contentIdentityAlgorithm: input.contentIdentity?.algorithm,
      contentIdentityValue: input.contentIdentity?.value,
      status: options.initialStatus ?? 'PENDING',
      collection: input.collection,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      errorMessage: options.errorMessage,
    })
    .returning();

  if (!row) throw new Error('Failed to insert knowledge document');
  return mapKnowledgeDocument(row);
}

export async function getKnowledgeDocumentById(
  db: DatabaseExecutor,
  organizationId: string,
  documentId: string,
): Promise<KnowledgeDocument | null> {
  const [row] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, organizationId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .limit(1);

  return row ? mapKnowledgeDocument(row) : null;
}

export async function getKnowledgeDocumentByContentIdentity(
  db: DatabaseExecutor,
  organizationId: string,
  contentIdentityValue: string,
): Promise<KnowledgeDocument | null> {
  const [row] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, organizationId),
        eq(knowledgeDocuments.contentIdentityValue, contentIdentityValue),
      ),
    )
    .limit(1);

  return row ? mapKnowledgeDocument(row) : null;
}

export interface UpdateKnowledgeDocumentStatusInput {
  readonly organizationId: string;
  readonly documentId: string;
  readonly nextStatus: KnowledgeDocumentStatus;
  readonly errorMessage?: string | undefined;
}

export async function updateKnowledgeDocumentStatus(
  db: DatabaseExecutor,
  input: UpdateKnowledgeDocumentStatusInput,
): Promise<KnowledgeDocument> {
  const { organizationId, documentId, nextStatus, errorMessage } = input;
  const current = await getKnowledgeDocumentById(db, organizationId, documentId);
  if (!current) {
    throw new Error(`Knowledge document '${documentId}' not found for tenant`);
  }

  validateDocumentStatusTransition(current.status, nextStatus);

  const [updated] = await db
    .update(knowledgeDocuments)
    .set({
      status: nextStatus,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeDocuments.organizationId, organizationId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .returning();

  if (!updated) throw new Error('Failed to update knowledge document status');
  return mapKnowledgeDocument(updated);
}

export async function listKnowledgeDocuments(
  db: DatabaseExecutor,
  organizationId: string,
  options: {
    readonly limit?: number | undefined;
    readonly offset?: number | undefined;
    readonly status?: KnowledgeDocumentStatus | undefined;
    readonly collection?: string | undefined;
  } = {},
): Promise<KnowledgeDocument[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
  const offset = Math.max(0, options.offset ?? 0);

  const conditions = [eq(knowledgeDocuments.organizationId, organizationId)];
  if (options.status) conditions.push(eq(knowledgeDocuments.status, options.status));
  if (options.collection) conditions.push(eq(knowledgeDocuments.collection, options.collection));

  const rows = await db
    .select()
    .from(knowledgeDocuments)
    .where(and(...conditions))
    .orderBy(desc(knowledgeDocuments.createdAt), asc(knowledgeDocuments.id))
    .limit(limit)
    .offset(offset);

  return rows.map(mapKnowledgeDocument);
}
