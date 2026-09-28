import type { TenantRole } from '@voice-agent/contracts';

export function canCreateAgent(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canReadAgentConfig(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

export function canEditAgent(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}
