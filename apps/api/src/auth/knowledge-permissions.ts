import type { TenantRole } from '@voice-agent/contracts';

export type KnowledgeManagementPermission =
  'knowledge.read' | 'knowledge.ingest' | 'knowledge.archive';

/** Gestão de documentos existentes (DEC-054). */
export type KnowledgeDocumentManagementPermission =
  'knowledge.update' | 'knowledge.associate' | 'knowledge.restore' | 'knowledge.delete';

export type KnowledgePermission =
  KnowledgeManagementPermission | KnowledgeDocumentManagementPermission;

export const KNOWLEDGE_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<KnowledgeManagementPermission>>
> = {
  OWNER: new Set(['knowledge.read', 'knowledge.ingest', 'knowledge.archive']),
  ADMIN: new Set(['knowledge.read', 'knowledge.ingest', 'knowledge.archive']),
  MANAGER: new Set(['knowledge.read', 'knowledge.ingest']),
  OPERATOR: new Set(),
  VIEWER: new Set(),
};

const FULL_DOCUMENT_MANAGEMENT: ReadonlySet<KnowledgeDocumentManagementPermission> = new Set([
  'knowledge.update',
  'knowledge.associate',
  'knowledge.restore',
  'knowledge.delete',
]);

/** MANAGER edita o que já pode cadastrar; associar, restaurar e excluir: OWNER/ADMIN. */
export const KNOWLEDGE_DOCUMENT_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<KnowledgeDocumentManagementPermission>>
> = {
  OWNER: FULL_DOCUMENT_MANAGEMENT,
  ADMIN: FULL_DOCUMENT_MANAGEMENT,
  MANAGER: new Set(['knowledge.update']),
  OPERATOR: new Set(),
  VIEWER: new Set(),
};

export function hasKnowledgePermission(role: TenantRole, permission: KnowledgePermission): boolean {
  const base = KNOWLEDGE_ROLE_PERMISSIONS[role];
  const documents = KNOWLEDGE_DOCUMENT_ROLE_PERMISSIONS[role];
  if (!base || !documents) return false;
  return (
    base.has(permission as KnowledgeManagementPermission) ||
    documents.has(permission as KnowledgeDocumentManagementPermission)
  );
}
