import type { TenantRole } from '@voice-agent/contracts';

// DEC-039. Espelho de UX apenas: a autorização real é do BFF/API.
export function canReadKnowledge(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

export function canIngestKnowledge(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

export function canArchiveKnowledge(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
