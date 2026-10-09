import type { TenantRole } from '@voice-agent/contracts';

export type KnowledgeManagementPermission =
  'knowledge.read' | 'knowledge.ingest' | 'knowledge.archive';

export const KNOWLEDGE_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<KnowledgeManagementPermission>>
> = {
  OWNER: new Set(['knowledge.read', 'knowledge.ingest', 'knowledge.archive']),
  ADMIN: new Set(['knowledge.read', 'knowledge.ingest', 'knowledge.archive']),
  MANAGER: new Set(['knowledge.read', 'knowledge.ingest']),
  OPERATOR: new Set(),
  VIEWER: new Set(),
};

export function hasKnowledgePermission(
  role: TenantRole,
  permission: KnowledgeManagementPermission,
): boolean {
  const permissions = KNOWLEDGE_ROLE_PERMISSIONS[role];
  return permissions ? permissions.has(permission) : false;
}
