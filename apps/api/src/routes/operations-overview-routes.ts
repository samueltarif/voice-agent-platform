import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  listOperationsAttemptsQuerySchema,
  operationsOverviewQuerySchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { hasCampaignPermission } from '../auth/campaign-permissions.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

const security = [{ internalServiceAssertion: [] }];

function overviewRepo(deps: ApiDependencies) {
  if (!deps.operationsOverviewRepo)
    throw new Error('Operations overview repository not configured');
  return deps.operationsOverviewRepo;
}

/** Visão operacional: qualquer papel que lê a organização (`agent.read`); tenant da assertion. */
async function authorizeRead(c: Context, deps: ApiDependencies) {
  const auth = getServiceAuth(c);
  return authorizeTenant({
    sub: auth.sub,
    orgId: auth.orgId,
    requiredPermission: 'agent.read',
    organizationRepo: deps.organizationRepo,
    membershipRepo: deps.membershipRepo,
  });
}

function registerOverview(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/operations/overview',
      summary: 'Organization operations overview from persisted state',
      security,
      request: { query: operationsOverviewQuerySchema },
      responses: { 200: { description: 'Overview' } },
    }),
    async (c) => {
      const tenant = await authorizeRead(c, deps);
      const query = c.req.valid('query' as never) as z.infer<typeof operationsOverviewQuerySchema>;
      const overview = await overviewRepo(deps).overview(tenant.organizationId, {
        days: query.days,
        includeCosts: hasCampaignPermission(tenant.role, 'campaigns.costs'),
        now: new Date(),
      });
      return c.json(overview, 200);
    },
  );
}

function registerAttempts(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/operations/attempts',
      summary: 'Organization call attempts (masked destinations), newest first',
      security,
      request: { query: listOperationsAttemptsQuerySchema },
      responses: { 200: { description: 'Attempts' } },
    }),
    async (c) => {
      const tenant = await authorizeRead(c, deps);
      const query = c.req.valid('query' as never) as z.infer<
        typeof listOperationsAttemptsQuerySchema
      >;
      const rows = await overviewRepo(deps).listAttempts(tenant.organizationId, {
        ...query,
        now: new Date(),
      });
      return c.json(rows, 200);
    },
  );
}

/** 008-MVP4c — dashboard e chamadas a partir do estado persistido (offline). */
export function registerOperationsOverviewRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerOverview(app, deps);
  registerAttempts(app, deps);
}
