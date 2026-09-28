import { describe, it, expect } from 'vitest';
import { canCreateAgent, canReadAgentConfig, canEditAgent } from './agent-permissions.js';

describe('Agent Permissions RBAC Helpers', () => {
  describe('canCreateAgent', () => {
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

  describe('canReadAgentConfig', () => {
    it('allows OWNER, ADMIN and MANAGER to read agent config', () => {
      expect(canReadAgentConfig('OWNER')).toBe(true);
      expect(canReadAgentConfig('ADMIN')).toBe(true);
      expect(canReadAgentConfig('MANAGER')).toBe(true);
    });

    it('denies OPERATOR, VIEWER and unknown roles', () => {
      expect(canReadAgentConfig('OPERATOR')).toBe(false);
      expect(canReadAgentConfig('VIEWER')).toBe(false);
      expect(canReadAgentConfig(null)).toBe(false);
      expect(canReadAgentConfig(undefined)).toBe(false);
    });
  });

  describe('canEditAgent', () => {
    it('allows OWNER, ADMIN and MANAGER to edit agent', () => {
      expect(canEditAgent('OWNER')).toBe(true);
      expect(canEditAgent('ADMIN')).toBe(true);
      expect(canEditAgent('MANAGER')).toBe(true);
    });

    it('denies OPERATOR, VIEWER and unknown roles', () => {
      expect(canEditAgent('OPERATOR')).toBe(false);
      expect(canEditAgent('VIEWER')).toBe(false);
      expect(canEditAgent(null)).toBe(false);
      expect(canEditAgent(undefined)).toBe(false);
    });
  });
});
