import { and, eq } from 'drizzle-orm';
import { AppError, NotFoundError } from '@voice-agent/errors';
import { KNOWLEDGE_MANAGEMENT_ERROR_CODES } from '@voice-agent/contracts';
import { auditLogs } from '../schema/audit.js';
import { knowledgeDocuments, type KnowledgeDocumentEntity } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface LockKnowledgeDocumentInput {
  readonly organizationId: string;
  readonly documentId: string;
  readonly expectedUpdatedAt: string;
}

export function knowledgeManagementError(
  code: keyof typeof KNOWLEDGE_MANAGEMENT_ERROR_CODES,
  message: string,
): AppError {
  const status = code === 'NO_CHANGES' ? 400 : 409;
  return new AppError(message, status, KNOWLEDGE_MANAGEMENT_ERROR_CODES[code]);
}

function sameInstant(a: Date, isoExpected: string): boolean {
  const expected = new Date(isoExpected);
  return !Number.isNaN(expected.getTime()) && a.getTime() === expected.getTime();
}

/**
 * Bloqueia a linha do documento (FOR UPDATE) DENTRO da organização e confere a
 * versão vista pelo cliente. Documento de outra organização = não encontrado.
 */
export async function lockKnowledgeDocument(
  tx: DatabaseExecutor,
  input: LockKnowledgeDocumentInput,
): Promise<KnowledgeDocumentEntity> {
  const [row] = await tx
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, input.organizationId),
        eq(knowledgeDocuments.id, input.documentId),
      ),
    )
    .for('update');
  if (!row) throw new NotFoundError(`Knowledge document '${input.documentId}' not found`);
  if (!sameInstant(row.updatedAt, input.expectedUpdatedAt)) {
    throw knowledgeManagementError('STALE', 'Knowledge document changed since it was loaded');
  }
  return row;
}

/** Sempre posterior ao valor anterior, para o token de concorrência mudar. */
export function nextUpdatedAt(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

export type KnowledgeAuditAction =
  | 'knowledge.document_updated'
  | 'knowledge.document_agent_changed'
  | 'knowledge.document_archived'
  | 'knowledge.document_restored'
  | 'knowledge.document_deleted';

export interface KnowledgeAuditInput {
  readonly organizationId: string;
  readonly actorId: string;
  readonly action: KnowledgeAuditAction;
  readonly documentId: string;
  /** Nunca inclui o conteúdo do documento. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export async function recordKnowledgeAudit(
  tx: DatabaseExecutor,
  input: KnowledgeAuditInput,
): Promise<void> {
  await tx.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorType: 'USER',
    action: input.action,
    targetType: 'knowledge_document',
    targetId: input.documentId,
    metadata: JSON.stringify(input.metadata),
  });
}
