export interface TenantScoped {
  readonly organizationId: string;
}

export const TENANT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
