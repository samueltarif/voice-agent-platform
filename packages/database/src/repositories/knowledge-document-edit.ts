import { and, eq } from 'drizzle-orm';
import {
  hasKnowledgeDocumentChanges,
  isKnowledgeDocumentManageable,
  type KnowledgeDocument,
  type SetKnowledgeDocumentAgentInput,
  type UpdateKnowledgeDocumentInput,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { agents } from '../schema/agents.js';
import { knowledgeDocuments, type KnowledgeDocumentEntity } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapKnowledgeDocument } from './knowledge-mapping.js';
import { replaceKnowledgeContent } from './knowledge-content-replacement.js';
import {
  knowledgeManagementError,
  lockKnowledgeDocument,
  nextUpdatedAt,
  recordKnowledgeAudit,
} from './knowledge-document-lock.js';

function assertManageable(row: KnowledgeDocumentEntity): void {
  const doc = mapKnowledgeDocument(row);
  if (doc.agentVersionId) {
    throw knowledgeManagementError('PINNED', 'Knowledge document is pinned to an agent version');
  }
  if (!isKnowledgeDocumentManageable(doc)) {
    throw knowledgeManagementError('NOT_EDITABLE', `Knowledge document is '${doc.status}'`);
  }
}

async function saveDocument(
  tx: DatabaseExecutor,
  row: KnowledgeDocumentEntity,
  values: Partial<typeof knowledgeDocuments.$inferInsert>,
): Promise<KnowledgeDocument> {
  const [updated] = await tx
    .update(knowledgeDocuments)
    .set({ ...values, updatedAt: nextUpdatedAt(row.updatedAt) })
    .where(
      and(
        eq(knowledgeDocuments.organizationId, row.organizationId),
        eq(knowledgeDocuments.id, row.id),
      ),
    )
    .returning();
  return mapKnowledgeDocument(updated!);
}

type DocumentValues = Partial<typeof knowledgeDocuments.$inferInsert>;

function metadataValues(input: UpdateKnowledgeDocumentInput): DocumentValues {
  const values: DocumentValues = {};
  if (input.title !== undefined) values.title = input.title.trim();
  if (input.collection !== undefined) values.collection = input.collection?.trim() ?? null;
  if (input.sourceVersion !== undefined) values.sourceVersion = input.sourceVersion?.trim() ?? null;
  return values;
}

async function buildEditValues(
  tx: DatabaseExecutor,
  row: KnowledgeDocumentEntity,
  input: UpdateKnowledgeDocumentInput,
): Promise<{ values: DocumentValues; chunkCount: number | undefined }> {
  const values = metadataValues(input);
  if (input.rawText === undefined) return { values, chunkCount: undefined };
  const replaced = await replaceKnowledgeContent(tx, row, input.rawText);
  return {
    values: {
      ...values,
      contentIdentityAlgorithm: 'sha256',
      contentIdentityValue: replaced.contentHash,
      chunkPolicyVersion: replaced.policy.policyVersion,
      chunkMaxChars: replaced.policy.maxChunkChars,
      chunkOverlapChars: replaced.policy.overlapChars,
    },
    chunkCount: replaced.chunkCount,
  };
}

/** Edita título, coleção, versão da fonte e/ou substitui o conteúdo (atômico). */
export async function updateKnowledgeDocument(
  db: DatabaseInstance,
  input: UpdateKnowledgeDocumentInput,
): Promise<KnowledgeDocument> {
  if (!hasKnowledgeDocumentChanges(input)) {
    throw knowledgeManagementError('NO_CHANGES', 'No knowledge document field to update');
  }
  return db.transaction(async (tx) => {
    const row = await lockKnowledgeDocument(tx, input);
    assertManageable(row);
    const { values, chunkCount } = await buildEditValues(tx, row, input);
    const updated = await saveDocument(tx, row, values);
    await recordKnowledgeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'knowledge.document_updated',
      documentId: row.id,
      metadata: {
        changedFields: Object.keys(values).filter((k) => !k.startsWith('chunk')),
        ...(chunkCount !== undefined ? { chunkCount } : {}),
      },
    });
    return updated;
  });
}

async function assertActiveAgentInOrganization(
  tx: DatabaseExecutor,
  organizationId: string,
  agentId: string,
): Promise<void> {
  const [agent] = await tx
    .select({ id: agents.id, status: agents.status })
    .from(agents)
    .where(and(eq(agents.organizationId, organizationId), eq(agents.id, agentId)))
    .for('share');
  // Inexistente, de outra organização ou arquivado: mesma resposta (não revela existência).
  if (!agent || agent.status !== 'ACTIVE') {
    throw knowledgeManagementError('AGENT_UNAVAILABLE', 'Agent is not available for tenant');
  }
}

/** Associa a um agente ativo da MESMA organização, ou libera para todos (`null`). */
export async function setKnowledgeDocumentAgent(
  db: DatabaseInstance,
  input: SetKnowledgeDocumentAgentInput,
): Promise<KnowledgeDocument> {
  return db.transaction(async (tx) => {
    const row = await lockKnowledgeDocument(tx, input);
    assertManageable(row);
    if (input.agentId)
      await assertActiveAgentInOrganization(tx, input.organizationId, input.agentId);
    if ((row.agentId ?? null) === input.agentId) {
      throw knowledgeManagementError('NO_CHANGES', 'Knowledge document already has this agent');
    }
    const updated = await saveDocument(tx, row, { agentId: input.agentId });
    await recordKnowledgeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'knowledge.document_agent_changed',
      documentId: row.id,
      metadata: { previousAgentId: row.agentId ?? null, agentId: input.agentId },
    });
    return updated;
  });
}
