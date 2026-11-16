import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { knowledgeRetrievalPreviewHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

/**
 * Pré-visualização OFFLINE da recuperação (DEC-055): devolve os trechos que um
 * agente receberia, sem IA, sem chamada e sem fornecedor. Organização sempre a
 * da asserção; agente validado no banco (ativo + versão publicada).
 */
export function registerKnowledgeRetrievalPreviewRoutes(
  app: OpenAPIHono,
  deps: ApiDependencies,
): void {
  const route = createRoute({
    method: 'post',
    path: '/v1/knowledge/retrieval-preview',
    summary: 'Preview Knowledge Retrieval (offline)',
    security: [{ internalServiceAssertion: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: knowledgeRetrievalPreviewHttpBodySchema } },
      },
    },
    responses: { 200: { description: 'Retrieved excerpts (untrusted data)' } },
  });

  app.openapi(route, async (c) => {
    const auth = getServiceAuth(c);
    await authorizeTenant({
      sub: auth.sub,
      orgId: auth.orgId,
      requiredPermission: 'knowledge.read',
      organizationRepo: deps.organizationRepo,
      membershipRepo: deps.membershipRepo,
    });
    const service = deps.knowledgeRetrievalPreview;
    if (!service) throw new Error('Knowledge retrieval preview not configured');
    const body = c.req.valid('json' as never) as z.infer<
      typeof knowledgeRetrievalPreviewHttpBodySchema
    >;
    const preview = await service.preview({ organizationId: auth.orgId, ...body });
    return c.json(preview, 200);
  });
}
