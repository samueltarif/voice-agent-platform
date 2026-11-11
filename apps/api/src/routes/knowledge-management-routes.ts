import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  associateKnowledgeDocumentHttpBodySchema,
  knowledgeLifecycleHttpBodySchema,
  updateKnowledgeDocumentHttpBodySchema,
  type KnowledgeManagementPort,
  type KnowledgeMutationActor,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import type { KnowledgeDocumentManagementPermission } from '../auth/knowledge-permissions.js';
import { toKnowledgeDocumentDto } from '../http/response-mappers.js';

const documentParams = z.object({ documentId: z.string().uuid() });
const deleteQuery = z.object({ expectedUpdatedAt: z.string().datetime() }).strict();

interface AuthorizedMutation {
  readonly service: KnowledgeManagementPort;
  readonly actor: Omit<KnowledgeMutationActor, 'expectedUpdatedAt'>;
}

/** RBAC revalidado no banco; organização SEMPRE a da asserção, nunca do corpo. */
async function authorizeMutation(
  c: Context,
  deps: ApiDependencies,
  permission: KnowledgeDocumentManagementPermission,
): Promise<AuthorizedMutation> {
  const auth = getServiceAuth(c);
  await authorizeTenant({
    sub: auth.sub,
    orgId: auth.orgId,
    requiredPermission: permission,
    organizationRepo: deps.organizationRepo,
    membershipRepo: deps.membershipRepo,
  });
  const service = deps.knowledgeManagement;
  if (!service) throw new Error('Knowledge management service not configured');
  const { documentId } = c.req.valid('param' as never) as { documentId: string };
  return { service, actor: { organizationId: auth.orgId, documentId, actorId: auth.sub } };
}

function documentRoute(method: 'patch' | 'put' | 'post' | 'delete', path: string, summary: string) {
  return {
    method,
    path,
    summary,
    security: [{ internalServiceAssertion: [] }],
    responses: { 200: { description: summary } },
  };
}

function registerUpdateRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  const route = createRoute({
    ...documentRoute('patch', '/v1/knowledge/documents/{documentId}', 'Update Knowledge Document'),
    request: {
      params: documentParams,
      body: {
        content: { 'application/json': { schema: updateKnowledgeDocumentHttpBodySchema } },
      },
    },
  });
  app.openapi(route, async (c) => {
    const { service, actor } = await authorizeMutation(c, deps, 'knowledge.update');
    const body = c.req.valid('json' as never) as z.infer<
      typeof updateKnowledgeDocumentHttpBodySchema
    >;
    const updated = await service.updateDocument({ ...actor, ...body });
    return c.json(toKnowledgeDocumentDto(updated), 200);
  });
}

function registerAssociateRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  const route = createRoute({
    ...documentRoute('put', '/v1/knowledge/documents/{documentId}/agent', 'Set Document Agent'),
    request: {
      params: documentParams,
      body: {
        content: { 'application/json': { schema: associateKnowledgeDocumentHttpBodySchema } },
      },
    },
  });
  app.openapi(route, async (c) => {
    const { service, actor } = await authorizeMutation(c, deps, 'knowledge.associate');
    const body = c.req.valid('json' as never) as z.infer<
      typeof associateKnowledgeDocumentHttpBodySchema
    >;
    const updated = await service.setDocumentAgent({ ...actor, ...body });
    return c.json(toKnowledgeDocumentDto(updated), 200);
  });
}

function registerRestoreRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  const route = createRoute({
    ...documentRoute('post', '/v1/knowledge/documents/{documentId}/restore', 'Restore Document'),
    request: {
      params: documentParams,
      body: { content: { 'application/json': { schema: knowledgeLifecycleHttpBodySchema } } },
    },
  });
  app.openapi(route, async (c) => {
    const { service, actor } = await authorizeMutation(c, deps, 'knowledge.restore');
    const body = c.req.valid('json' as never) as z.infer<typeof knowledgeLifecycleHttpBodySchema>;
    const restored = await service.restoreDocument({ ...actor, ...body });
    return c.json(toKnowledgeDocumentDto(restored), 200);
  });
}

function registerDeleteRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  const route = createRoute({
    ...documentRoute('delete', '/v1/knowledge/documents/{documentId}', 'Delete Document'),
    request: { params: documentParams, query: deleteQuery },
  });
  app.openapi(route, async (c) => {
    const { service, actor } = await authorizeMutation(c, deps, 'knowledge.delete');
    const query = c.req.valid('query' as never) as z.infer<typeof deleteQuery>;
    await service.deleteDocument({ ...actor, expectedUpdatedAt: query.expectedUpdatedAt });
    return c.json({ id: actor.documentId, deleted: true }, 200);
  });
}

export function registerKnowledgeManagementRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerUpdateRoute(app, deps);
  registerAssociateRoute(app, deps);
  registerRestoreRoute(app, deps);
  registerDeleteRoute(app, deps);
}
