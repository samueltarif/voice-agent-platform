import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError } from '@voice-agent/errors';
import { listKnowledgeDocumentsQuerySchema } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toKnowledgeDocumentDto } from '../http/response-mappers.js';

function registerListRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/knowledge/documents',
      summary: 'List Knowledge Documents',
      security: [{ internalServiceAssertion: [] }],
      request: { query: listKnowledgeDocumentsQuerySchema },
      responses: { 200: { description: 'List of knowledge document metadata' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'knowledge.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const query = c.req.valid('query' as never) as z.infer<
        typeof listKnowledgeDocumentsQuerySchema
      >;
      const repo = deps.knowledgeRepo;
      if (!repo) throw new Error('Knowledge repository not configured');

      const docs = await repo.listDocuments(auth.orgId, query);
      return c.json(
        docs.map((d) => toKnowledgeDocumentDto(d)),
        200,
      );
    },
  );
}

function registerGetRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/knowledge/documents/{documentId}',
      summary: 'Get Knowledge Document Metadata',
      security: [{ internalServiceAssertion: [] }],
      request: { params: z.object({ documentId: z.string().uuid() }) },
      responses: { 200: { description: 'Knowledge document metadata retrieved' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'knowledge.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { documentId } = c.req.valid('param' as never) as { documentId: string };
      const repo = deps.knowledgeRepo;
      if (!repo) throw new Error('Knowledge repository not configured');

      const doc = await repo.getDocumentById(auth.orgId, documentId);
      if (!doc) {
        throw new NotFoundError(`Knowledge document '${documentId}' not found`);
      }

      return c.json(toKnowledgeDocumentDto(doc), 200);
    },
  );
}

export function registerKnowledgeReadRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerListRoute(app, deps);
  registerGetRoute(app, deps);
}
