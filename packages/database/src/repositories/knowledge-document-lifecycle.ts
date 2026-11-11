import { and, count, eq } from 'drizzle-orm';
import {
  isKnowledgeDocumentDeletable,
  isKnowledgeDocumentRestorable,
  type KnowledgeDocument,
  type KnowledgeMutationActor,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { knowledgeChunks, knowledgeDocuments } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapKnowledgeDocument } from './knowledge-mapping.js';
import { updateKnowledgeDocumentStatus } from './knowledge-document-repository.js';
import {
  knowledgeManagementError,
  lockKnowledgeDocument,
  nextUpdatedAt,
  recordKnowledgeAudit,
} from './knowledge-document-lock.js';

async function countChunks(
  tx: DatabaseExecutor,
  organizationId: string,
  documentId: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.organizationId, organizationId),
        eq(knowledgeChunks.documentId, documentId),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Restauração (DEC-054, emenda à ADR-020 §3): ARQUIVADO → PRONTO apenas se os
 * trechos e a identidade de conteúdo continuam íntegros. Arquivar não apaga
 * trechos, então o documento volta exatamente como estava.
 */
export async function restoreKnowledgeDocument(
  db: DatabaseInstance,
  input: KnowledgeMutationActor,
): Promise<KnowledgeDocument> {
  return db.transaction(async (tx) => {
    const row = await lockKnowledgeDocument(tx, input);
    if (!isKnowledgeDocumentRestorable(row.status)) {
      throw knowledgeManagementError('NOT_RESTORABLE', `Knowledge document is '${row.status}'`);
    }
    const chunks = await countChunks(tx, row.organizationId, row.id);
    if (chunks === 0 || !row.contentIdentityValue) {
      throw knowledgeManagementError('NOT_RESTORABLE', 'Knowledge document has no content');
    }
    const [updated] = await tx
      .update(knowledgeDocuments)
      .set({ status: 'READY', errorMessage: null, updatedAt: nextUpdatedAt(row.updatedAt) })
      .where(
        and(
          eq(knowledgeDocuments.organizationId, row.organizationId),
          eq(knowledgeDocuments.id, row.id),
        ),
      )
      .returning();
    await recordKnowledgeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'knowledge.document_restored',
      documentId: row.id,
      metadata: { chunkCount: chunks },
    });
    return mapKnowledgeDocument(updated!);
  });
}

/**
 * Exclusão definitiva: só documento ARQUIVADO e sem agente/versão associados.
 * Os trechos são removidos em cascata; a auditoria permanece.
 */
export async function deleteKnowledgeDocument(
  db: DatabaseInstance,
  input: KnowledgeMutationActor,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockKnowledgeDocument(tx, input);
    const doc = mapKnowledgeDocument(row);
    if (!isKnowledgeDocumentDeletable(doc)) {
      const code = doc.status === 'ARCHIVED' ? 'IN_USE' : 'NOT_EDITABLE';
      throw knowledgeManagementError(code, 'Knowledge document cannot be deleted');
    }
    await tx
      .delete(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, row.organizationId),
          eq(knowledgeDocuments.id, row.id),
        ),
      );
    await recordKnowledgeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'knowledge.document_deleted',
      documentId: row.id,
      metadata: { title: row.title, sourceType: row.sourceType },
    });
  });
}

/** Arquivamento com auditoria na mesma transação (mantém a checagem de concorrência). */
export async function archiveKnowledgeDocumentWithAudit(
  db: DatabaseInstance,
  input: { readonly organizationId: string; readonly documentId: string; readonly actorId: string },
): Promise<KnowledgeDocument> {
  return db.transaction(async (tx) => {
    const archived = await updateKnowledgeDocumentStatus(tx, {
      organizationId: input.organizationId,
      documentId: input.documentId,
      nextStatus: 'ARCHIVED',
    });
    await recordKnowledgeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'knowledge.document_archived',
      documentId: input.documentId,
      metadata: {},
    });
    return archived;
  });
}
