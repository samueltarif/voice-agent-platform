import { serve } from '@hono/node-server';
import type { JSONWebKeySet } from 'jose';
import {
  createDatabaseConnection,
  AgentRepository,
  AgentVersionRepository,
  AgentLifecycleService,
  AgentDraftService,
  AgentDraftDiscardService,
  AgentPublicationService,
  CommercialEntitlementResolver,
  DefaultCommercialPublicationPolicy,
  MembershipRepository,
  OrganizationRepository,
  UserOrganizationContextRepository,
} from '@voice-agent/database';
import { ServiceAssertionVerifier } from './auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from './auth/bootstrap-assertion-verifier.js';
import { createApiLogger } from './logging/api-logger.js';
import { createApp } from './app.js';

const logger = createApiLogger('server');

const port = Number(process.env.PORT || '3001');
const publicJwksJson = process.env.INTERNAL_SERVICE_PUBLIC_JWKS;

if (!publicJwksJson) {
  logger.error('Missing INTERNAL_SERVICE_PUBLIC_JWKS environment variable');
  process.exit(1);
}

let publicJwks: JSONWebKeySet;
try {
  publicJwks = JSON.parse(publicJwksJson) as JSONWebKeySet;
} catch {
  logger.error('Failed to parse INTERNAL_SERVICE_PUBLIC_JWKS as JSON');
  process.exit(1);
}

const { db, pool } = createDatabaseConnection();

const entitlementResolver = new CommercialEntitlementResolver(db);
const publicationPolicy = new DefaultCommercialPublicationPolicy(db, entitlementResolver);

const agentRepo = new AgentRepository(db);
const versionRepo = new AgentVersionRepository(db);
const lifecycleService = new AgentLifecycleService(db, entitlementResolver);
const draftService = new AgentDraftService(db);
const discardService = new AgentDraftDiscardService(db);
const publicationService = new AgentPublicationService(db, publicationPolicy);
const membershipRepo = new MembershipRepository(db);
const organizationRepo = new OrganizationRepository(db);
const userOrgContextRepo = new UserOrganizationContextRepository(db);

const verifier = new ServiceAssertionVerifier({ publicJwks });
const bootstrapVerifier = new BootstrapAssertionVerifier({ publicJwks });

const app = createApp({
  logger,
  verifier,
  bootstrapVerifier,
  agentRepo,
  versionRepo,
  lifecycleService,
  draftService,
  discardService,
  publicationService,
  membershipRepo,
  organizationRepo,
  userOrgContextRepo,
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Voice Agent Platform API listening on http://localhost:${info.port}`);
});

const shutdown = async () => {
  logger.info('Shutting down server gracefully...');
  server.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
