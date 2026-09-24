import type { TenantRole } from '@voice-agent/contracts';

export type AgentPermission =
  | 'agent.read'
  | 'agent.config.read'
  | 'agent.create'
  | 'agent.edit'
  | 'agent.test'
  | 'agent.publish'
  | 'agent.archive';

export const ROLE_PERMISSIONS: Readonly<Record<TenantRole, ReadonlySet<AgentPermission>>> = {
  OWNER: new Set([
    'agent.read',
    'agent.config.read',
    'agent.create',
    'agent.edit',
    'agent.test',
    'agent.publish',
    'agent.archive',
  ]),
  ADMIN: new Set([
    'agent.read',
    'agent.config.read',
    'agent.create',
    'agent.edit',
    'agent.test',
    'agent.publish',
    'agent.archive',
  ]),
  MANAGER: new Set(['agent.read', 'agent.config.read', 'agent.edit', 'agent.test']),
  OPERATOR: new Set(['agent.read', 'agent.test']),
  VIEWER: new Set(['agent.read']),
};

export function hasAgentPermission(role: TenantRole, permission: AgentPermission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.has(permission) : false;
}
