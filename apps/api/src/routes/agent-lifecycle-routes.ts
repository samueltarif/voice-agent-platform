import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { createAgentHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toAgentMetadataDto } from '../http/response-mappers.js';

export function registerAgentLifecycleRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/agents',
      summary: 'Create Agent',
      security: [{ internalServiceAssertion: [] }],
      request: {
        body: {
          content: {
            'application/json': {
              schema: createAgentHttpBodySchema,
            },
          },
        },
      },
      responses: { 201: { description: 'Agent created successfully' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.create',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const body = c.req.valid('json' as never) as z.infer<typeof createAgentHttpBodySchema>;
      const created = await deps.lifecycleService.createAgent({
        organizationId: auth.orgId,
        name: body.name,
        slug: body.slug,
        createdBy: auth.sub,
      });

      return c.json(toAgentMetadataDto(created, null), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/agents/{agentId}/archive',
      summary: 'Archive Agent',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Agent archived' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.archive',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { agentId } = c.req.valid('param' as never) as { agentId: string };
      const archived = await deps.agentRepo.archiveAgent({
        organizationId: auth.orgId,
        agentId,
        actorId: auth.sub,
      });

      return c.json(toAgentMetadataDto(archived, null), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/agents/{agentId}/reactivate',
      summary: 'Reactivate Agent',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Agent reactivated' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.archive',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { agentId } = c.req.valid('param' as never) as { agentId: string };
      const reactivated = await deps.lifecycleService.reactivateAgent({
        organizationId: auth.orgId,
        agentId,
        actorId: auth.sub,
      });

      return c.json(toAgentMetadataDto(reactivated, null), 200);
    },
  );
}
