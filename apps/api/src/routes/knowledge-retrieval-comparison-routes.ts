import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { knowledgeRetrievalComparisonHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { logKnowledgeComparisonAudit } from './knowledge-retrieval-comparison-audit.js';

/**
 * Comparação ADMINISTRATIVA v1 × v2 da busca (DEC-067, PR B1): só OWNER/ADMIN
 * (`knowledge.compare`). Organização sempre a da asserção; agente validado no
 * banco como na pré-visualização. Não altera o que nenhum agente usa.
 */
export function registerKnowledgeRetrievalComparisonRoutes(
  app: OpenAPIHono,
  deps: ApiDependencies,
): void {
  const route = createRoute({
    method: 'post',
    path: '/v1/knowledge/retrieval-comparison',
    summary: 'Compare Knowledge Retrieval v1 × v2 (offline, administrative)',
    security: [{ internalServiceAssertion: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: knowledgeRetrievalComparisonHttpBodySchema } },
      },
    },
    responses: { 200: { description: 'Both result lists (untrusted data)' } },
  });

  app.openapi(route, async (c) => {
    const auth = getServiceAuth(c);
    await authorizeTenant({
      sub: auth.sub,
      orgId: auth.orgId,
      requiredPermission: 'knowledge.compare',
      organizationRepo: deps.organizationRepo,
      membershipRepo: deps.membershipRepo,
    });
    const service = deps.knowledgeRetrievalComparison;
    if (!service) throw new Error('Knowledge retrieval comparison not configured');
    const body = c.req.valid('json' as never) as z.infer<
      typeof knowledgeRetrievalComparisonHttpBodySchema
    >;
    const comparison = await service.compare({ organizationId: auth.orgId, ...body });
    logKnowledgeComparisonAudit(
      deps.logger,
      { organizationId: auth.orgId, agentScoped: body.agentId !== undefined },
      comparison,
    );
    return c.json(comparison, 200);
  });
}
