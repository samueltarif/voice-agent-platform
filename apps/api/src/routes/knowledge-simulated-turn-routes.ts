import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { knowledgeSimulatedTurnHttpBodySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

/**
 * Conversa SIMULADA do Agent Studio (DEC-061): um turno determinístico com
 * `knowledge.search` da versão publicada do agente. Organização sempre a da
 * asserção; agente revalidado no banco (ativo + versão publicada). Exige ler a
 * configuração do agente E a Base de Conhecimento. Sem IA, chamada ou provedor.
 */
export function registerKnowledgeSimulatedTurnRoutes(
  app: OpenAPIHono,
  deps: ApiDependencies,
): void {
  const route = createRoute({
    method: 'post',
    path: '/v1/knowledge/simulated-turn',
    summary: 'Simulated knowledge turn (offline, deterministic)',
    security: [{ internalServiceAssertion: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: knowledgeSimulatedTurnHttpBodySchema } },
      },
    },
    responses: { 200: { description: 'Deterministic simulated reply with cited excerpts' } },
  });

  app.openapi(route, async (c) => {
    const auth = getServiceAuth(c);
    const base = {
      sub: auth.sub,
      orgId: auth.orgId,
      organizationRepo: deps.organizationRepo,
      membershipRepo: deps.membershipRepo,
    };
    await authorizeTenant({ ...base, requiredPermission: 'agent.config.read' });
    await authorizeTenant({ ...base, requiredPermission: 'knowledge.read' });
    const service = deps.knowledgeSimulatedTurn;
    if (!service) throw new Error('Knowledge simulated turn not configured');
    const body = c.req.valid('json' as never) as z.infer<
      typeof knowledgeSimulatedTurnHttpBodySchema
    >;
    const result = await service.run({ organizationId: auth.orgId, ...body });
    return c.json(result, 200);
  });
}
