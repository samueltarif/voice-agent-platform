import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  assignCampaignAudienceInputSchema,
  campaignActionInputSchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { permissionForCampaignAction } from '../auth/campaign-permissions.js';
import { authorizeTenant, type TenantPermission } from '../auth/tenant-authorization.js';

const campaignParams = z.object({ campaignId: z.string().uuid() });
const security = [{ internalServiceAssertion: [] }];

function lifecycleRepo(deps: ApiDependencies) {
  if (!deps.campaignLifecycleRepo) throw new Error('Campaign lifecycle repository not configured');
  return deps.campaignLifecycleRepo;
}

async function authorize(c: Context, deps: ApiDependencies, permission: TenantPermission) {
  const auth = getServiceAuth(c);
  await authorizeTenant({
    sub: auth.sub,
    orgId: auth.orgId,
    requiredPermission: permission,
    organizationRepo: deps.organizationRepo,
    membershipRepo: deps.membershipRepo,
  });
  return auth.orgId;
}

/** Rejeição de negócio com código estável (a UI traduz; nada interno é exposto). */
function rejected(c: Context, reason: string) {
  const status = reason === 'NOT_FOUND' || reason === 'LIST_NOT_FOUND' ? 404 : 409;
  return c.json(
    { error: { code: reason, message: `Campaign operation rejected: ${reason}` } },
    status,
  );
}

function registerAudience(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/campaigns/{campaignId}/audience',
      summary: 'Assign the campaign audience',
      security,
      request: {
        params: campaignParams,
        body: { content: { 'application/json': { schema: assignCampaignAudienceInputSchema } } },
      },
      responses: { 200: { description: 'Audience assigned' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'campaigns.operate');
      const { campaignId } = c.req.valid('param' as never) as z.infer<typeof campaignParams>;
      const body = c.req.valid('json' as never) as z.infer<
        typeof assignCampaignAudienceInputSchema
      >;
      const outcome = await lifecycleRepo(deps).assignAudience({
        organizationId: orgId,
        campaignId,
        contactListId: body.contactListId,
        scheduledStartAt: body.scheduledStartAt ? new Date(body.scheduledStartAt) : undefined,
      });
      if (outcome.kind === 'REJECTED') return rejected(c, outcome.reason);
      return c.json({ status: 'ASSIGNED' }, 200);
    },
  );
}

function registerActions(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/campaigns/{campaignId}/actions',
      summary: 'Start, pause, resume or cancel a campaign',
      security,
      request: {
        params: campaignParams,
        body: { content: { 'application/json': { schema: campaignActionInputSchema } } },
      },
      responses: { 200: { description: 'Campaign transitioned' } },
    }),
    async (c) => {
      const body = c.req.valid('json' as never) as z.infer<typeof campaignActionInputSchema>;
      const orgId = await authorize(c, deps, permissionForCampaignAction(body.action));
      const { campaignId } = c.req.valid('param' as never) as z.infer<typeof campaignParams>;
      const outcome = await lifecycleRepo(deps).applyAction({
        organizationId: orgId,
        campaignId,
        action: body.action,
        now: new Date(),
      });
      if (outcome.kind === 'REJECTED') return rejected(c, outcome.reason);
      const { kind: _kind, ...result } = outcome;
      return c.json(result, 200);
    },
  );
}

function registerProgress(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/campaigns/{campaignId}/progress',
      summary: 'Real campaign progress and audience',
      security,
      request: { params: campaignParams },
      responses: { 200: { description: 'Progress' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'agent.read');
      const { campaignId } = c.req.valid('param' as never) as z.infer<typeof campaignParams>;
      const scope = { organizationId: orgId, campaignId };
      const [progress, audience] = await Promise.all([
        lifecycleRepo(deps).progress(scope),
        lifecycleRepo(deps).getAudience(scope),
      ]);
      return c.json(
        {
          progress,
          audience: audience
            ? {
                contactListId: audience.contactListId,
                scheduledStartAt: audience.scheduledStartAt?.toISOString() ?? null,
              }
            : null,
        },
        200,
      );
    },
  );
}

/** 008-MVP2 — audiência, ações operacionais e progresso real de campanhas. */
export function registerCampaignLifecycleRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerAudience(app, deps);
  registerActions(app, deps);
  registerProgress(app, deps);
}
