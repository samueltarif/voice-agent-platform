import { describe, it, expect } from 'vitest';
import type { TenantRole } from '@voice-agent/contracts';
import {
  hasKnowledgePermission,
  type KnowledgeDocumentManagementPermission,
} from './knowledge-permissions.js';

/** DEC-054: matriz exata das permissões de gestão de documentos. */
describe('Knowledge document management RBAC matrix', () => {
  const roles: TenantRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
  const expected: Record<KnowledgeDocumentManagementPermission, TenantRole[]> = {
    'knowledge.update': ['OWNER', 'ADMIN', 'MANAGER'],
    'knowledge.associate': ['OWNER', 'ADMIN'],
    'knowledge.restore': ['OWNER', 'ADMIN'],
    'knowledge.delete': ['OWNER', 'ADMIN'],
  };

  it('grants each management permission only to the expected roles', () => {
    for (const [permission, allowed] of Object.entries(expected)) {
      for (const role of roles) {
        expect(
          hasKnowledgePermission(role, permission as KnowledgeDocumentManagementPermission),
          `${role} ${permission}`,
        ).toBe(allowed.includes(role));
      }
    }
  });

  it('denies unknown roles', () => {
    expect(hasKnowledgePermission('GUEST' as TenantRole, 'knowledge.update')).toBe(false);
  });
});
