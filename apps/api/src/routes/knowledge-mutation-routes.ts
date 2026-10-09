import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BadRequestError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
} from '@voice-agent/errors';
import {
  ingestKnowledgeDocumentHttpBodySchema,
  validateDocumentStatusTransition,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';
import { toKnowledgeDocumentDto } from '../http/response-mappers.js';

function mapIngestionError(error: unknown): never {
  if (error instanceof Error) {
    if (
      error.message.includes('Conflicting duplicate document') ||
      error.message.includes('Concurrent knowledge document ingestion failed')
    ) {
      throw new ConflictError(error.message);
    }
    if (
      error.message.includes('rawText must not be empty') ||
      error.message.includes('rawText exceeds maximum length') ||
      error.message.includes('empty after normalization')
    ) {
      throw new BadRequestError(error.message);
    }
  }
  throw error;
}

function registerIngestRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/knowledge/documents',
      summary: 'Ingest Knowledge Document',
      security: [{ internalServiceAssertion: [] }],
      request: {
        body: {
          content: { 'application/json': { schema: ingestKnowledgeDocumentHttpBodySchema } },
        },
      },
      responses: { 201: { description: 'Document ingested successfully' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'knowledge.ingest',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const body = c.req.valid('json' as never) as z.infer<
        typeof ingestKnowledgeDocumentHttpBodySchema
      >;
      const repo = deps.knowledgeRepo;
      if (!repo) throw new Error('Knowledge repository not configured');

      try {
        const result = await repo.ingestDocument({
          organizationId: auth.orgId,
          title: body.title,
          source: body.source,
          rawText: body.rawText,
          collection: body.collection,
          agentId: body.agentId,
          agentVersionId: body.agentVersionId,
          chunkingPolicy: body.chunkingPolicy,
        });

        return c.json(toKnowledgeDocumentDto(result.document, result.isIdempotentDuplicate), 201);
      } catch (err: unknown) {
        mapIngestionError(err);
      }
    },
  );
}

function registerArchiveRoute(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/knowledge/documents/{documentId}/archive',
      summary: 'Archive Knowledge Document',
      security: [{ internalServiceAssertion: [] }],
      request: { params: z.object({ documentId: z.string().uuid() }) },
      responses: { 200: { description: 'Knowledge document archived successfully' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'knowledge.archive',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });

      const { documentId } = c.req.valid('param' as never) as { documentId: string };
      const repo = deps.knowledgeRepo;
      if (!repo) throw new Error('Knowledge repository not configured');

      const existing = await repo.getDocumentById(auth.orgId, documentId);
      if (!existing) {
        throw new NotFoundError(`Knowledge document '${documentId}' not found`);
      }

      try {
        validateDocumentStatusTransition(existing.status, 'ARCHIVED');
      } catch (err: unknown) {
        if (err instanceof Error) throw new InvalidStateTransitionError(err.message);
        throw err;
      }

      const archived = await repo.archiveDocument(auth.orgId, documentId);
      return c.json(toKnowledgeDocumentDto(archived), 200);
    },
  );
}

export function registerKnowledgeMutationRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerIngestRoute(app, deps);
  registerArchiveRoute(app, deps);
}
