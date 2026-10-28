import type { TenantRole } from '@voice-agent/contracts';

export type ContactPermission = 'contacts.read' | 'contacts.manage' | 'contacts.suppress';

/**
 * 008-MVP1. Registrar supressão é ação PROTETIVA (ex.: pedido de opt-out
 * recebido pela operação), por isso OPERATOR pode suprimir mas não importar.
 * Remover supressão não existe nesta slice.
 */
export const CONTACT_ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<ContactPermission>>
> = {
  OWNER: new Set(['contacts.read', 'contacts.manage', 'contacts.suppress']),
  ADMIN: new Set(['contacts.read', 'contacts.manage', 'contacts.suppress']),
  MANAGER: new Set(['contacts.read', 'contacts.manage', 'contacts.suppress']),
  OPERATOR: new Set(['contacts.read', 'contacts.suppress']),
  VIEWER: new Set(['contacts.read']),
};

export function hasContactPermission(role: TenantRole, permission: ContactPermission): boolean {
  return CONTACT_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
