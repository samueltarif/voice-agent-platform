import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError } from '@voice-agent/errors';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toAgentMetadataDto } from '../http/response-mappers.js';

export function registerAgentReadRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/agents',
      summary: 'List Organization Agents',
      security: [{ internalServiceAssertion: [] }],
      responses: { 200: { description: 'List of agent metadata' } },
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

      const agentRows = await deps.agentRepo.listAgentsByOrganization({
        organizationId: auth.orgId,
      });

      const dtos = await Promise.all(
        agentRows.map(async (agent) => {
          const published = await deps.versionRepo.getCurrentPublishedVersion({
            organizationId: auth.orgId,
            agentId: agent.id,
          });
          return toAgentMetadataDto(agent, published?.versionNumber ?? null);
        }),
      );

      return c.json(dtos, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/agents/{agentId}',
      summary: 'Get Agent Metadata',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Agent metadata retrieved' } },
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

      const { agentId } = c.req.valid('param' as never) as { agentId: string };
      const agent = await deps.agentRepo.getAgentById({
        organizationId: auth.orgId,
        agentId,
      });

      if (!agent) {
        throw new NotFoundError(`Agent '${agentId}' not found`);
      }

      const published = await deps.versionRepo.getCurrentPublishedVersion({
        organizationId: auth.orgId,
        agentId,
      });

      return c.json(toAgentMetadataDto(agent, published?.versionNumber ?? null), 200);
    },
  );
}
