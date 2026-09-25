import type { TenantRole } from '@voice-agent/contracts';

export function canCreateAgent(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
