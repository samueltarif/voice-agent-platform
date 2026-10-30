import type { TenantRole } from '@voice-agent/contracts';

/** Espelho de UI do RBAC de contatos da API (008-MVP1); a API decide. */
export function canManageContacts(role?: TenantRole | string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

/** Registrar supressão é protetivo: OPERATOR também pode. Remoção não existe. */
export function canSuppressContacts(role?: TenantRole | string | null): boolean {
  return canManageContacts(role) || role === 'OPERATOR';
}
