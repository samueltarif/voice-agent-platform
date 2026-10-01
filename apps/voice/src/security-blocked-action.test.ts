import { describe, expect, it } from 'vitest';
import {
  createSecurityBlockedResult,
  type SecurityBlockedResult,
} from './security-blocked-action.js';

describe('security-blocked-action', () => {
  it('should return exact deep equality with outcome SECURITY_BLOCKED', () => {
    const result: SecurityBlockedResult = createSecurityBlockedResult();
    expect(result).toEqual({ outcome: 'SECURITY_BLOCKED' });
  });

  it('should contain only the outcome property with no extra fields', () => {
    const result = createSecurityBlockedResult();
    const keys = Object.keys(result);
    expect(keys).toEqual(['outcome']);
    expect(result.outcome).toBe('SECURITY_BLOCKED');
  });

  it('should produce identical results across multiple executions without mutable state', () => {
    const first = createSecurityBlockedResult();
    const second = createSecurityBlockedResult();
    expect(first).toEqual(second);
  });

  it('should require zero arguments to execute', () => {
    expect(createSecurityBlockedResult.length).toBe(0);
  });

  it('should not throw any exception upon invocation', () => {
    expect(() => createSecurityBlockedResult()).not.toThrow();
  });
});
