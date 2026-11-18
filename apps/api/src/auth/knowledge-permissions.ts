import type { TenantRole } from '@voice-agent/contracts';

export type KnowledgeManagementPermission =
  'knowledge.read' | 'knowledge.ingest' | 'knowledge.archive';

/** Gestão de documentos existentes (DEC-054). */
export type KnowledgeDocumentManagementPermission =
  'knowledge.update' | 'knowledge.associate' | 'knowledge.restore' | 'knowledge.delete';

/** Comparação administrativa v1 × v2 da busca (DEC-067): só OWNER/ADMIN. */
export type KnowledgeAdministrationPermission = 'knowledge.compare';

export type KnowledgePermission =
  | KnowledgeManagementPermission
  | KnowledgeDocumentManagementPermission
  | KnowledgeAdministrationPermission;

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

const KNOWLEDGE_ADMINISTRATION_ROLES: ReadonlySet<TenantRole> = new Set(['OWNER', 'ADMIN']);

export function hasKnowledgePermission(role: TenantRole, permission: KnowledgePermission): boolean {
  if (permission === 'knowledge.compare') return KNOWLEDGE_ADMINISTRATION_ROLES.has(role);
  const base = KNOWLEDGE_ROLE_PERMISSIONS[role];
  const documents = KNOWLEDGE_DOCUMENT_ROLE_PERMISSIONS[role];
  if (!base || !documents) return false;
  return (
    base.has(permission as KnowledgeManagementPermission) ||
    documents.has(permission as KnowledgeDocumentManagementPermission)
  );
}
