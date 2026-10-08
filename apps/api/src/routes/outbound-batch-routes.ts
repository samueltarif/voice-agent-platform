import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { scheduleBatchJobsHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toOutboundCallJobDto } from '../http/response-mappers.js';

export function registerOutboundBatchRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  const handler = async (c: Parameters<Parameters<OpenAPIHono['openapi']>[1]>[0]) => {
    const auth = getServiceAuth(c);
    await authorizeTenant({
      sub: auth.sub,
      orgId: auth.orgId,
      requiredPermission: 'agent.edit',
      organizationRepo: deps.organizationRepo,
      membershipRepo: deps.membershipRepo,
    });

    const { campaignId } = c.req.valid('param' as never) as { campaignId: string };
    const body = c.req.valid('json' as never) as z.infer<typeof scheduleBatchJobsHttpBodySchema>;

    const repo = deps.outboundRepo;
    if (!repo) throw new Error('Outbound repository not configured');

    const jobs = await repo.scheduleBatchJobs({
      organizationId: auth.orgId,
      campaignId,
      batchIdempotencyKey: body.batchIdempotencyKey,
      items: body.items,
    });

    return c.json(
      {
        campaignId,
        count: jobs.length,
        jobs: jobs.map(toOutboundCallJobDto),
      },
      201,
    );
  };

  const routeConfig = {
    method: 'post' as const,
    summary: 'Schedule Batch Outbound Jobs',
    security: [{ internalServiceAssertion: [] }],
    request: {
      params: z.object({ campaignId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: scheduleBatchJobsHttpBodySchema } } },
    },
    responses: { 201: { description: 'Batch scheduled' } },
  };

  app.openapi(
    createRoute({ ...routeConfig, path: '/v1/campaigns/{campaignId}/batch-schedule' }),
    handler,
  );
  app.openapi(createRoute({ ...routeConfig, path: '/v1/campaigns/{campaignId}/batch' }), handler);
}
