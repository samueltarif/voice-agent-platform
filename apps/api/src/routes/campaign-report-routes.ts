import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { listCampaignAttemptsQuerySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { hasCampaignPermission } from '../auth/campaign-permissions.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

const campaignParams = z.object({ campaignId: z.string().uuid() });
const security = [{ internalServiceAssertion: [] }];

function reportRepo(deps: ApiDependencies) {
  if (!deps.campaignReportRepo) throw new Error('Campaign report repository not configured');
  return deps.campaignReportRepo;
}

/** Leitura de relatório: qualquer papel que lê campanhas (`agent.read`), escopo do tenant. */
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

const notFound = (c: Context) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Campaign not found.' } }, 404);

function registerReport(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/campaigns/{campaignId}/report',
      summary: 'Campaign report from persisted state (costs only for authorized roles)',
      security,
      request: { params: campaignParams },
      responses: { 200: { description: 'Report' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const tenant = await authorizeRead(c, deps);
      const { campaignId } = c.req.valid('param' as never) as z.infer<typeof campaignParams>;
      const report = await reportRepo(deps).report(
        { organizationId: tenant.organizationId, campaignId },
        { includeCosts: hasCampaignPermission(tenant.role, 'campaigns.costs') },
      );
      return report ? c.json(report, 200) : notFound(c);
    },
  );
}

function registerAttempts(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/campaigns/{campaignId}/attempts',
      summary: 'Campaign attempts (masked destinations), newest first',
      security,
      request: { params: campaignParams, query: listCampaignAttemptsQuerySchema },
      responses: { 200: { description: 'Attempts' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const tenant = await authorizeRead(c, deps);
      const { campaignId } = c.req.valid('param' as never) as z.infer<typeof campaignParams>;
      const query = c.req.valid('query' as never) as z.infer<
        typeof listCampaignAttemptsQuerySchema
      >;
      const rows = await reportRepo(deps).listAttempts(
        { organizationId: tenant.organizationId, campaignId },
        query,
      );
      return rows ? c.json(rows, 200) : notFound(c);
    },
  );
}

/** 008-MVP4 — relatórios de campanha a partir do estado persistido (offline). */
export function registerCampaignReportRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerReport(app, deps);
  registerAttempts(app, deps);
}
