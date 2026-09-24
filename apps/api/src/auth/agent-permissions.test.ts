import { describe, it, expect } from 'vitest';
import { hasAgentPermission, ROLE_PERMISSIONS, type AgentPermission } from './agent-permissions.js';
import type { TenantRole } from '@voice-agent/contracts';

describe('Agent Permissions RBAC Matrix', () => {
  const allRoles: TenantRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
  const allPermissions: AgentPermission[] = [
    'agent.read',
    'agent.config.read',
    'agent.create',
    'agent.edit',
    'agent.test',
    'agent.publish',
    'agent.archive',
  ];

  const expectedMatrix: Record<AgentPermission, TenantRole[]> = {
    'agent.read': ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'],
    'agent.config.read': ['OWNER', 'ADMIN', 'MANAGER'],
    'agent.create': ['OWNER', 'ADMIN'],
    'agent.edit': ['OWNER', 'ADMIN', 'MANAGER'],
    'agent.test': ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
    'agent.publish': ['OWNER', 'ADMIN'],
    'agent.archive': ['OWNER', 'ADMIN'],
  };

  it('verifies exact canonical permissions for every role', () => {
    for (const role of allRoles) {
      const allowed = ROLE_PERMISSIONS[role];
      expect(allowed).toBeDefined();

      for (const permission of allPermissions) {
        const expectedAllowed = expectedMatrix[permission].includes(role);
        expect(
          hasAgentPermission(role, permission),
          `Role '${role}' should ${expectedAllowed ? '' : 'NOT '}have permission '${permission}'`,
        ).toBe(expectedAllowed);
      }
    }
  });

  it('rejects unknown or invalid role', () => {
    expect(hasAgentPermission('GUEST' as unknown as TenantRole, 'agent.read')).toBe(false);
    expect(hasAgentPermission('' as unknown as TenantRole, 'agent.read')).toBe(false);
  });
});
