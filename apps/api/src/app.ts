import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiDependencies } from './composition/agent-dependencies.js';
import { requestIdMiddleware, getRequestId } from './http/request-id.js';
import { openApiDefaultHook, createApiErrorHandler } from './http/error-handler.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { registerAgentReadRoutes } from './routes/agent-read-routes.js';
import { registerAgentLifecycleRoutes } from './routes/agent-lifecycle-routes.js';
import { registerAgentVersionReadRoutes } from './routes/agent-version-read-routes.js';
import { registerAgentDraftRoutes } from './routes/agent-draft-routes.js';
import { registerMeOrganizationRoutes } from './routes/me-organization-routes.js';
import { registerOutboundCampaignRoutes } from './routes/outbound-campaign-routes.js';
import { registerOutboundBatchRoutes } from './routes/outbound-batch-routes.js';
import { registerKnowledgeReadRoutes } from './routes/knowledge-read-routes.js';
import { registerKnowledgeMutationRoutes } from './routes/knowledge-mutation-routes.js';
import { registerKnowledgeManagementRoutes } from './routes/knowledge-management-routes.js';
import { registerKnowledgeRetrievalPreviewRoutes } from './routes/knowledge-retrieval-preview-routes.js';
import { registerKnowledgeRetrievalComparisonRoutes } from './routes/knowledge-retrieval-comparison-routes.js';
import { registerKnowledgeSimulatedTurnRoutes } from './routes/knowledge-simulated-turn-routes.js';
import { registerKnowledgeExtractionRoutes } from './routes/knowledge-extraction-routes.js';
import { registerContactListRoutes } from './routes/contact-list-routes.js';
import { registerContactSuppressionRoutes } from './routes/contact-suppression-routes.js';
import { registerCampaignLifecycleRoutes } from './routes/campaign-lifecycle-routes.js';
import { registerCampaignReportRoutes } from './routes/campaign-report-routes.js';
import { registerOperationsOverviewRoutes } from './routes/operations-overview-routes.js';
import { registerLeadRoutes } from './routes/lead-routes.js';
import { registerSchedulingCalendarRoutes } from './routes/scheduling-calendar-routes.js';
import { registerSchedulingAvailabilityRoutes } from './routes/scheduling-availability-routes.js';
import { registerMeetingRoutes } from './routes/meeting-routes.js';
import { serviceAuthMiddleware } from './auth/service-auth-middleware.js';

import { bootstrapAuthMiddleware } from './auth/bootstrap-auth-middleware.js';

function registerOpenApiDocs(app: OpenAPIHono): void {
  app.openAPIRegistry.registerComponent('securitySchemes', 'internalServiceAssertion', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Internal Asymmetric Service Assertion (EdDSA / Ed25519)',
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'bootstrapAssertion', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Bootstrap Asymmetric Service Assertion (EdDSA / Ed25519 user-scoped)',
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
}

/** Base de Conhecimento: leitura, ingestão, gestão, pré-visualizações, conversa simulada e envio de arquivo. */
function registerKnowledgeRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerKnowledgeReadRoutes(app, deps);
  registerKnowledgeMutationRoutes(app, deps);
  registerKnowledgeManagementRoutes(app, deps);
  registerKnowledgeRetrievalPreviewRoutes(app, deps);
  registerKnowledgeRetrievalComparisonRoutes(app, deps);
  registerKnowledgeSimulatedTurnRoutes(app, deps);
  registerKnowledgeExtractionRoutes(app, deps);
}

/** Leads, agendas e reuniões (E1, DEC-074). */
function registerSchedulingRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerLeadRoutes(app, deps);
  registerSchedulingCalendarRoutes(app, deps);
  registerSchedulingAvailabilityRoutes(app, deps);
  registerMeetingRoutes(app, deps);
}

/** Asserção interna assimétrica obrigatória em todas as rotas de tenant. */
function registerTenantRouteAuthentication(app: OpenAPIHono, deps: ApiDependencies): void {
  app.use('/v1/agents', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/agents/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/campaigns', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/campaigns/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/knowledge', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/knowledge/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/contact-lists', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/contact-lists/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/contact-suppressions', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/operations/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/leads', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/leads/*', serviceAuthMiddleware(deps.verifier));
  app.use('/v1/scheduling/*', serviceAuthMiddleware(deps.verifier));
}

export function createApp(deps: ApiDependencies): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: openApiDefaultHook,
  });

  // 1. Request correlation ID middleware (runs first for all incoming requests)
  app.use('*', requestIdMiddleware());

  // 2. Health probe (unauthenticated)
  registerHealthRoutes(app);

  // 3. Register OpenAPI security schemes & documentation endpoint
  registerOpenApiDocs(app);

  // 4. Asymmetric internal service authentication for tenant routes
  registerTenantRouteAuthentication(app, deps);

  // 5. Asymmetric bootstrap authentication for user-scoped routes
  app.use('/v1/me/*', bootstrapAuthMiddleware(deps.bootstrapVerifier));

  // 6. Mount feature routes
  registerAgentReadRoutes(app, deps);
  registerAgentLifecycleRoutes(app, deps);
  registerAgentVersionReadRoutes(app, deps);
  registerAgentDraftRoutes(app, deps);
  registerMeOrganizationRoutes(app, deps);
  registerOutboundCampaignRoutes(app, deps);
  registerOutboundBatchRoutes(app, deps);
  registerKnowledgeRoutes(app, deps);
  registerContactListRoutes(app, deps);
  registerContactSuppressionRoutes(app, deps);
  registerCampaignLifecycleRoutes(app, deps);
  registerCampaignReportRoutes(app, deps);
  registerOperationsOverviewRoutes(app, deps);
  registerSchedulingRoutes(app, deps);

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
