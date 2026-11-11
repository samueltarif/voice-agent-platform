import {
  isKnowledgeDocumentDeletable,
  isKnowledgeDocumentManageable,
  isKnowledgeDocumentRestorable,
  isPinnedToAgentVersion,
  type KnowledgeDocumentResponse,
  type TenantRole,
} from '@voice-agent/contracts';

/** Ações de gestão de um documento (DEC-054). Espelho de UX; a API decide. */
export type KnowledgeDocumentAction = 'edit' | 'associate' | 'archive' | 'restore' | 'delete';

export type KnowledgeManagePermissions = Readonly<Record<KnowledgeDocumentAction, boolean>>;

const ADMIN_ROLES: readonly string[] = ['OWNER', 'ADMIN'];

export function knowledgeManagePermissions(
  role?: TenantRole | string | null,
): KnowledgeManagePermissions {
  const admin = ADMIN_ROLES.includes(role ?? '');
  return {
    edit: admin || role === 'MANAGER',
    associate: admin,
    archive: admin,
    restore: admin,
    delete: admin,
  };
}

export function hasAnyKnowledgeAction(permissions: KnowledgeManagePermissions): boolean {
  return Object.values(permissions).some(Boolean);
}

type ActionRule = readonly [KnowledgeDocumentAction, (doc: KnowledgeDocumentResponse) => boolean];

/** Ordem do menu e condição de estado de cada ação. */
const ACTION_RULES: readonly ActionRule[] = [
  ['edit', isKnowledgeDocumentManageable],
  ['associate', isKnowledgeDocumentManageable],
  ['archive', (doc) => doc.status !== 'ARCHIVED'],
  ['restore', (doc) => isKnowledgeDocumentRestorable(doc.status)],
  ['delete', isKnowledgeDocumentDeletable],
];

/** Ações oferecidas para o documento, conforme estado, associação e papel. */
export function availableKnowledgeActions(
  doc: KnowledgeDocumentResponse,
  permissions: KnowledgeManagePermissions,
): KnowledgeDocumentAction[] {
  return ACTION_RULES.filter(([action, applies]) => permissions[action] && applies(doc)).map(
    ([action]) => action,
  );
}

export const ORGANIZATION_WIDE_AGENT_LABEL = 'Todos os agentes';

/**
 * Rótulo honesto da associação: sem agente o documento é consultável por TODOS
 * os agentes da organização (regra atual da busca), não por nenhum.
 */
export function knowledgeAgentLabel(
  doc: Pick<KnowledgeDocumentResponse, 'agentId' | 'agentVersionId'>,
  agentNames: ReadonlyMap<string, string>,
): string {
  if (!doc.agentId) return ORGANIZATION_WIDE_AGENT_LABEL;
  const name = agentNames.get(doc.agentId) ?? `${doc.agentId.slice(0, 8)}…`;
  return isPinnedToAgentVersion(doc) ? `${name} · versão fixada` : name;
}
