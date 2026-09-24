import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { createDraftHttpBodySchema, updateDraftHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toAgentVersionMetadataDto } from '../http/response-mappers.js';

export function registerAgentDraftRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  // 1. POST /v1/agents/{agentId}/drafts
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/agents/{agentId}/drafts',
      summary: 'Create Version Draft',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid() }),
        body: { content: { 'application/json': { schema: createDraftHttpBodySchema } } },
      },
      responses: { 201: { description: 'Draft created' } },
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

      const { agentId } = c.req.valid('param' as never) as { agentId: string };
      const body = c.req.valid('json' as never) as z.infer<typeof createDraftHttpBodySchema>;

      const draft = await deps.draftService.createDraft({
        organizationId: auth.orgId,
        agentId,
        configuration: body.configuration,
        changelog: body.changelog,
        createdBy: auth.sub,
      });

      return c.json(toAgentVersionMetadataDto(draft), 201);
    },
  );

  // 2. PATCH /v1/agents/{agentId}/drafts/{versionId}
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/v1/agents/{agentId}/drafts/{versionId}',
      summary: 'Update Draft Configuration',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid(), versionId: z.string().uuid() }),
        body: { content: { 'application/json': { schema: updateDraftHttpBodySchema } } },
      },
      responses: { 200: { description: 'Draft updated' } },
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

      const { agentId, versionId } = c.req.valid('param' as never) as {
        agentId: string;
        versionId: string;
      };
      const body = c.req.valid('json' as never) as z.infer<typeof updateDraftHttpBodySchema>;

      const updated = await deps.draftService.updateDraftConfiguration({
        organizationId: auth.orgId,
        agentId,
        versionId,
        configuration: body.configuration,
        changelog: body.changelog,
      });

      return c.json(toAgentVersionMetadataDto(updated), 200);
    },
  );

  // 3. DELETE /v1/agents/{agentId}/drafts/{versionId}
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/agents/{agentId}/drafts/{versionId}',
      summary: 'Discard Draft',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid(), versionId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Draft discarded' } },
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

      const { agentId, versionId } = c.req.valid('param' as never) as {
        agentId: string;
        versionId: string;
      };
      const result = await deps.discardService.discardDraft({
        organizationId: auth.orgId,
        agentId,
        versionId,
        actorId: auth.sub,
      });

      return c.json({ success: result.success }, 200);
    },
  );

  // 4. POST /v1/agents/{agentId}/drafts/{versionId}/publish
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/agents/{agentId}/drafts/{versionId}/publish',
      summary: 'Publish Draft Version',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: z.object({ agentId: z.string().uuid(), versionId: z.string().uuid() }),
      },
      responses: { 200: { description: 'Version published' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'agent.publish',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { agentId, versionId } = c.req.valid('param' as never) as {
        agentId: string;
        versionId: string;
      };
      const published = await deps.publicationService.publishDraft({
        organizationId: auth.orgId,
        agentId,
        draftVersionId: versionId,
        publishedBy: auth.sub,
      });

      return c.json(toAgentVersionMetadataDto(published), 200);
    },
  );
}
