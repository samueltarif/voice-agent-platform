import { describe, it, expect } from 'vitest';
import {
  hasKnowledgePermission,
  KNOWLEDGE_ROLE_PERMISSIONS,
  type KnowledgeManagementPermission,
} from './knowledge-permissions.js';
import type { TenantRole } from '@voice-agent/contracts';

describe('Knowledge Management Permissions RBAC Matrix', () => {
  const allRoles: TenantRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
  const allPermissions: KnowledgeManagementPermission[] = [
    'knowledge.read',
    'knowledge.ingest',
    'knowledge.archive',
  ];

  const expectedMatrix: Record<KnowledgeManagementPermission, TenantRole[]> = {
    'knowledge.read': ['OWNER', 'ADMIN', 'MANAGER'],
    'knowledge.ingest': ['OWNER', 'ADMIN', 'MANAGER'],
    'knowledge.archive': ['OWNER', 'ADMIN'],
  };

  it('verifies exact canonical permissions for every role', () => {
    for (const role of allRoles) {
      const allowed = KNOWLEDGE_ROLE_PERMISSIONS[role];
      expect(allowed).toBeDefined();

      for (const permission of allPermissions) {
        const expectedAllowed = expectedMatrix[permission].includes(role);
        expect(
          hasKnowledgePermission(role, permission),
          `Role '${role}' should ${expectedAllowed ? '' : 'NOT '}have permission '${permission}'`,
        ).toBe(expectedAllowed);
      }
    }
  });

  it('rejects unknown or invalid role', () => {
    expect(hasKnowledgePermission('GUEST' as unknown as TenantRole, 'knowledge.read')).toBe(false);
    expect(hasKnowledgePermission('' as unknown as TenantRole, 'knowledge.read')).toBe(false);
  });
});
