import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiDependencies } from './composition/agent-dependencies.js';
import { requestIdMiddleware, getRequestId } from './http/request-id.js';
import { openApiDefaultHook, createApiErrorHandler } from './http/error-handler.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { registerAgentReadRoutes } from './routes/agent-read-routes.js';
import { registerAgentLifecycleRoutes } from './routes/agent-lifecycle-routes.js';
import { registerAgentVersionReadRoutes } from './routes/agent-version-read-routes.js';
import { registerAgentDraftRoutes } from './routes/agent-draft-routes.js';
import { serviceAuthMiddleware } from './auth/service-auth-middleware.js';

export function createApp(deps: ApiDependencies): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: openApiDefaultHook,
  });

  // 1. Request correlation ID middleware (runs first for all incoming requests)
  app.use('*', requestIdMiddleware());

  // 2. Health probe (unauthenticated)
  registerHealthRoutes(app);

  // 3. Register OpenAPI security schemes & documentation endpoint
  app.openAPIRegistry.registerComponent('securitySchemes', 'internalServiceAssertion', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Internal Asymmetric Service Assertion (EdDSA / Ed25519)',
  });

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Voice Agent Platform API',
      version: '1.0.0',
      description: 'Agent Studio Core HTTP APIs with Asymmetric Service Assertion Authentication',
    },
    security: [{ internalServiceAssertion: [] }],
  });

  // 4. Asymmetric internal service authentication for all /v1/* endpoints
  app.use('/v1/*', serviceAuthMiddleware(deps.verifier));

  // 5. Mount feature routes
  registerAgentReadRoutes(app, deps);
  registerAgentLifecycleRoutes(app, deps);
  registerAgentVersionReadRoutes(app, deps);
  registerAgentDraftRoutes(app, deps);

  // 6. Global error handler & not found handler with canonical error envelopes
  app.onError(createApiErrorHandler(deps.logger));

  app.notFound((c) => {
    const requestId = getRequestId(c);
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: `Route '${c.req.method} ${c.req.path}' not found`,
          requestId,
        },
      },
      404,
    );
  });

  return app;
}
