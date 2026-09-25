import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError } from '@voice-agent/errors';
import {
  organizationContextResponseSchema,
  type OrganizationContextResponse,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getBootstrapAuth } from '../auth/bootstrap-auth-middleware.js';

function registerListUserOrganizations(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me/organizations',
      summary: 'List User Organizations',
      description:
        'Returns active organizations where the authenticated user has an active membership.',
      security: [{ bootstrapAssertion: [] }],
      responses: {
        200: {
          description: 'List of active user organizations',
          content: {
            'application/json': {
              schema: organizationContextResponseSchema.array(),
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = getBootstrapAuth(c);
      const rows = await deps.userOrgContextRepo.listActiveOrganizationsForUser(auth.sub);
      const response: OrganizationContextResponse[] = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        role: r.role,
      }));
      return c.json(response, 200);
    },
  );
}

function registerGetOrganizationBySlug(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me/organizations/{orgSlug}',
      summary: 'Get Organization Context by Slug',
      description: 'Resolves organization metadata and verifies active membership for the user.',
      security: [{ bootstrapAssertion: [] }],
      request: {
        params: z.object({
          orgSlug: z.string().min(1).max(100),
        }),
      },
      responses: {
        200: {
          description: 'Organization context resolved successfully',
          content: {
            'application/json': {
              schema: organizationContextResponseSchema,
            },
          },
        },
        404: {
          description: 'Organization not found or user is not an active member',
        },
      },
    }),
    async (c) => {
      const auth = getBootstrapAuth(c);
      const { orgSlug } = c.req.valid('param');

      const found = await deps.userOrgContextRepo.findActiveOrganizationBySlugForUser({
        userId: auth.sub,
        slug: orgSlug,
      });

      if (!found) {
        throw new NotFoundError(`Organization '${orgSlug}' not found`);
      }

      const response: OrganizationContextResponse = {
        id: found.id,
        slug: found.slug,
        name: found.name,
        role: found.role,
      };

      return c.json(response, 200);
    },
  );
}

export function registerMeOrganizationRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerListUserOrganizations(app, deps);
  registerGetOrganizationBySlug(app, deps);
}
