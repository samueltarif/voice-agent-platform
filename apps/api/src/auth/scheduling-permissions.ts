import type { TenantRole } from '@voice-agent/contracts';

export type SchedulingPermission =
  'leads.read' | 'leads.manage' | 'scheduling.read' | 'scheduling.manage' | 'scheduling.book';

const READ = ['leads.read', 'scheduling.read'] as const;
const OPERATE = [...READ, 'leads.manage', 'scheduling.book'] as const;
const MANAGE = [...OPERATE, 'scheduling.manage'] as const;

/**
 * E1 (DEC-074). Configurar agendas (política, disponibilidade, exceções) é
 * gestão: OWNER, ADMIN e MANAGER. A operação (status do lead, marcar e
 * cancelar reuniões) inclui OPERATOR. VIEWER só lê.
 */
export const SCHEDULING_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<SchedulingPermission>>
> = {
  OWNER: new Set(MANAGE),
  ADMIN: new Set(MANAGE),
  MANAGER: new Set(MANAGE),
  OPERATOR: new Set(OPERATE),
  VIEWER: new Set(READ),
};

export function hasSchedulingPermission(
  role: TenantRole,
  permission: SchedulingPermission,
): boolean {
  return SCHEDULING_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isSchedulingPermission(permission: string): permission is SchedulingPermission {
  return permission.startsWith('leads.') || permission.startsWith('scheduling.');
}
