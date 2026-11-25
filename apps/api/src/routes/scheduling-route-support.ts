import type { Context } from 'hono';
import type { SchedulingActor } from '@voice-agent/database';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type { SchedulingApiDependencies } from '../composition/scheduling-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import type { SchedulingPermission } from '../auth/scheduling-permissions.js';

/** E1 (DEC-074) — peças comuns às rotas de leads, agendas e reuniões. */
export const schedulingSecurity = [{ internalServiceAssertion: [] }];

export function schedulingDeps(deps: ApiDependencies): SchedulingApiDependencies {
  if (!deps.scheduling) throw new Error('Scheduling dependencies not configured');
  return deps.scheduling;
}

export interface SchedulingRequestContext {
  readonly organizationId: string;
  readonly actor: SchedulingActor;
}

/** Revalida organização, vínculo e papel no banco; o ator é sempre o usuário autenticado. */
export async function authorizeScheduling(
  c: Context,
  deps: ApiDependencies,
  permission: SchedulingPermission,
): Promise<SchedulingRequestContext> {
  const auth = getServiceAuth(c);
  const tenant = await authorizeTenant({
    sub: auth.sub,
    orgId: auth.orgId,
    requiredPermission: permission,
    organizationRepo: deps.organizationRepo,
    membershipRepo: deps.membershipRepo,
  });
  return { organizationId: tenant.organizationId, actor: { type: 'USER', id: tenant.userId } };
}

const NOT_FOUND_CODES = new Set([
  'NOT_FOUND',
  'CONTACT_NOT_FOUND',
  'CALENDAR_NOT_FOUND',
  'LEAD_NOT_FOUND',
  'MEETING_NOT_FOUND',
]);

/** Recusa de negócio com código estável; o motivo detalhado vem quando existe. */
export function schedulingRejected(c: Context, code: string, reason?: string) {
  const status = NOT_FOUND_CODES.has(code) ? 404 : 409;
  return c.json(
    {
      error: {
        code,
        ...(reason ? { reason } : {}),
        message: `Scheduling operation rejected: ${code}`,
      },
    },
    status,
  );
}
