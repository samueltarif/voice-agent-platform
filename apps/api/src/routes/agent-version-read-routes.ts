import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError } from '@voice-agent/errors';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toAgentVersionMetadataDto, toAgentConfigurationDto } from '../http/response-mappers.js';

function registerListVersionsRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/agents/{agentId}/versions',
      summary: 'List Agent Versions Metadata',
      security: [{ internalServiceAssertion: [] }],
      request: { params: z.object({ agentId: z.string().uuid() }) },
      responses: { 200: { description: 'Version metadata list' } },
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
      const agent = await deps.agentRepo.getAgentById({ organizationId: auth.orgId, agentId });
      if (!agent) {
        throw new NotFoundError(`Agent '${agentId}' not found`);
      }

      const versions = await deps.versionRepo.listVersionsByAgent({
        organizationId: auth.orgId,
        agentId,
      });

      return c.json(versions.map(toAgentVersionMetadataDto), 200);
    },
  );
}

function registerGetVersionConfigurationRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/agents/{agentId}/versions/{versionId}/configuration',
      summary: 'Get Agent Version Configuration Snapshot',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid(), versionId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Configuration snapshot' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.config.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { agentId, versionId } = c.req.valid('param' as never) as {
        agentId: string;
        versionId: string;
      };
      const version = await deps.versionRepo.getVersionById({
        organizationId: auth.orgId,
        agentId,
        versionId,
      });
      if (!version) {
        throw new NotFoundError(`AgentVersion '${versionId}' not found`);
      }

      return c.json(toAgentConfigurationDto(version), 200);
    },
  );
}

export function registerAgentVersionReadRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerListVersionsRoute(app, deps);
  registerGetVersionConfigurationRoute(app, deps);
}
