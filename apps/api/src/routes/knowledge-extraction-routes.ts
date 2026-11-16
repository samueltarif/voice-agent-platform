import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AppError } from '@voice-agent/errors';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  knowledgeExtractionHttpBodySchema,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from '@voice-agent/knowledge-extraction';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

const PATH = '/v1/knowledge/extractions';

/** Recusas do arquivo ⇒ 422; tamanho ⇒ 413; limite de concorrência ⇒ 503. */
function toHttpError(error: KnowledgeExtractionError): AppError {
  if (error.code === CODES.TOO_LARGE) return new AppError('File too large.', 413, error.code);
  if (error.code === CODES.BUSY) return new AppError('Extraction busy.', 503, error.code);
  return new AppError('File rejected.', 422, error.code);
}

/** Autenticação (asserção) já validada; aqui organização ativa + `knowledge.ingest`. */
function requireIngestPermission(deps: ApiDependencies): MiddlewareHandler {
  return async (c, next) => {
    const auth = getServiceAuth(c);
    await authorizeTenant({
      sub: auth.sub,
      orgId: auth.orgId,
      requiredPermission: 'knowledge.ingest',
      organizationRepo: deps.organizationRepo,
      membershipRepo: deps.membershipRepo,
    });
    await next();
  };
}

/**
 * PR A1 (DEC-065) — pré-visualização SOMENTE LEITURA do texto de um arquivo.
 * Ordem: asserção de serviço → organização + `knowledge.ingest` → teto do
 * corpo → validação do contrato → extração no worker. Nada é gravado; nome,
 * conteúdo e base64 nunca vão para logs (os erros levam só o código).
 */
export function registerKnowledgeExtractionRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  app.use(PATH, requireIngestPermission(deps));
  app.use(
    PATH,
    bodyLimit({
      maxSize: KNOWLEDGE_UPLOAD_LIMITS.maxRequestBodyBytes,
      onError: (c) => c.json({ error: { code: CODES.TOO_LARGE } }, 413),
    }),
  );
  const route = createRoute({
    method: 'post',
    path: PATH,
    summary: 'Extract plain text from an uploaded file (read-only preview)',
    security: [{ internalServiceAssertion: [] }],
    request: {
      body: { content: { 'application/json': { schema: knowledgeExtractionHttpBodySchema } } },
    },
    responses: { 200: { description: 'Extracted text preview; nothing is stored' } },
  });
  app.openapi(route, async (c) => {
    const extractor = deps.knowledgeExtraction;
    if (!extractor) throw new Error('Knowledge extraction not configured');
    const body = c.req.valid('json' as never) as z.infer<typeof knowledgeExtractionHttpBodySchema>;
    try {
      return c.json(await extractor.extract(body), 200);
    } catch (error) {
      if (error instanceof KnowledgeExtractionError) throw toHttpError(error);
      throw error;
    }
  });
}
