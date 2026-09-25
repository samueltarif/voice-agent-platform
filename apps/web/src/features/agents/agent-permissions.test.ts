import { describe, it, expect } from 'vitest';
import { canCreateAgent } from './agent-permissions.js';

describe('canCreateAgent (RBAC Helper)', () => {
  it('allows OWNER and ADMIN to create agents', () => {
    expect(canCreateAgent('OWNER')).toBe(true);
    expect(canCreateAgent('ADMIN')).toBe(true);
  });

  it('denies MANAGER, OPERATOR, VIEWER and unknown roles', () => {
    expect(canCreateAgent('MANAGER')).toBe(false);
    expect(canCreateAgent('OPERATOR')).toBe(false);
    expect(canCreateAgent('VIEWER')).toBe(false);
    expect(canCreateAgent(null)).toBe(false);
    expect(canCreateAgent(undefined)).toBe(false);
    expect(canCreateAgent('UNKNOWN')).toBe(false);
  });
});
