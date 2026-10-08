import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError } from '@voice-agent/errors';
import {
  createOutboundCampaignHttpBodySchema,
  listOutboundCampaignsQuerySchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toOutboundCampaignDto } from '../http/response-mappers.js';

function registerCreateCampaignRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/campaigns',
      summary: 'Create Outbound Campaign',
      security: [{ internalServiceAssertion: [] }],
      request: {
        body: { content: { 'application/json': { schema: createOutboundCampaignHttpBodySchema } } },
      },
      responses: { 201: { description: 'Campaign created' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.edit',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const body = c.req.valid('json' as never) as z.infer<
        typeof createOutboundCampaignHttpBodySchema
      >;

      const repo = deps.outboundRepo;
      if (!repo) throw new Error('Outbound repository not configured');

      const campaign = await repo.createCampaign({
        organizationId: auth.orgId,
        agentId: body.agentId,
        agentVersionId: body.agentVersionId,
        name: body.name,
        description: body.description,
        status: body.status,
      });

      return c.json(toOutboundCampaignDto(campaign), 201);
    },
  );
}

function registerListCampaignsRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/campaigns',
      summary: 'List Outbound Campaigns',
      security: [{ internalServiceAssertion: [] }],
      request: { query: listOutboundCampaignsQuerySchema },
      responses: { 200: { description: 'List of campaigns' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const query = c.req.valid('query' as never) as z.infer<
        typeof listOutboundCampaignsQuerySchema
      >;
      const repo = deps.outboundRepo;
      if (!repo) throw new Error('Outbound repository not configured');

      const campaigns = await repo.listCampaigns({
        organizationId: auth.orgId,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json(campaigns.map(toOutboundCampaignDto), 200);
    },
  );
}

function registerGetCampaignRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/campaigns/{campaignId}',
      summary: 'Get Outbound Campaign',
      security: [{ internalServiceAssertion: [] }],
      request: { params: z.object({ campaignId: z.string().uuid() }) },
      responses: { 200: { description: 'Campaign retrieved' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { campaignId } = c.req.valid('param' as never) as { campaignId: string };
      const repo = deps.outboundRepo;
      if (!repo) throw new Error('Outbound repository not configured');

      const campaign = await repo.getCampaignById(auth.orgId, campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${campaignId}' not found`);
      }

      return c.json(toOutboundCampaignDto(campaign), 200);
    },
  );
}

export function registerOutboundCampaignRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerCreateCampaignRoute(app, deps);
  registerListCampaignsRoute(app, deps);
  registerGetCampaignRoute(app, deps);
}
