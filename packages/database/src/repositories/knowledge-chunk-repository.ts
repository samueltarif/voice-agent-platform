import { and, asc, eq } from 'drizzle-orm';
import type { KnowledgeChunk } from '@voice-agent/contracts';
import { knowledgeChunks, type NewKnowledgeChunkEntity } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapKnowledgeChunk } from './knowledge-mapping.js';

export async function insertKnowledgeChunks(
  db: DatabaseExecutor,
  chunks: readonly NewKnowledgeChunkEntity[],
): Promise<KnowledgeChunk[]> {
  if (chunks.length === 0) return [];

  const rows = await db
    .insert(knowledgeChunks)
    .values([...chunks])
    .returning();

  return rows.map(mapKnowledgeChunk);
}

export async function getKnowledgeChunksByDocumentId(
  db: DatabaseExecutor,
  organizationId: string,
  documentId: string,
): Promise<KnowledgeChunk[]> {
  const rows = await db
    .select()
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.organizationId, organizationId),
        eq(knowledgeChunks.documentId, documentId),
      ),
    )
    .orderBy(asc(knowledgeChunks.ordinal));

  return rows.map(mapKnowledgeChunk);
}

export async function deleteKnowledgeChunksByDocumentId(
  db: DatabaseExecutor,
  organizationId: string,
  documentId: string,
): Promise<number> {
  const deleted = await db
    .delete(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.organizationId, organizationId),
        eq(knowledgeChunks.documentId, documentId),
      ),
    )
    .returning({ id: knowledgeChunks.id });

  return deleted.length;
}
