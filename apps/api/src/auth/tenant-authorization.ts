import { ForbiddenError } from '@voice-agent/errors';
import type { TenantRole } from '@voice-agent/contracts';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';
import { hasAgentPermission, type AgentPermission } from './agent-permissions.js';

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: TenantRole;
}

export interface AuthorizeTenantOptions {
  sub: string;
  orgId: string;
  requiredPermission: AgentPermission;
  organizationRepo: OrganizationRepository;
  membershipRepo: MembershipRepository;
}

export async function authorizeTenant(options: AuthorizeTenantOptions): Promise<TenantContext> {
  const { sub, orgId, requiredPermission, organizationRepo, membershipRepo } = options;

  // 1. Revalidate Organization status in database
  const org = await organizationRepo.findOrganizationById({ id: orgId });
  if (!org || org.status !== 'ACTIVE') {
    throw new ForbiddenError(`Organization '${orgId}' is not active or accessible`);
  }

  // 2. Revalidate Membership status in database
  const membership = await membershipRepo.findMembership({
    organizationId: orgId,
    userId: sub,
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError(
      `User '${sub}' does not have an active membership in organization '${orgId}'`,
    );
  }

  // 3. Revalidate RBAC permission using role dynamically read from DB
  const allowed = hasAgentPermission(membership.role as TenantRole, requiredPermission);
  if (!allowed) {
    throw new ForbiddenError(
      `Tenant role '${membership.role}' does not have permission '${requiredPermission}'`,
    );
  }

  return {
    organizationId: orgId,
    userId: sub,
    role: membership.role as TenantRole,
  };
}
