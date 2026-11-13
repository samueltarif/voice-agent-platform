/**
 * Superfície EXCLUSIVA de testes (subpath `@voice-agent/database/test-support`):
 * banco PostgreSQL descartável comprovadamente local + fixtures multi-tenant.
 * Código de produção não deve importar este módulo.
 */
export {
  createDisposableTestDatabase,
  type DisposableTestDatabase,
} from './disposable-test-database.js';
export {
  createDurableOutboundFixture,
  createExtraJob,
  createTenant,
  type DurableOutboundFixture,
  type TenantFixture,
} from './durable-outbound-fixtures.js';
export { createKnowledgeSimulationFixture } from './knowledge-simulation-fixtures.js';
export {
  knowledgeSimulationConfig,
  KNOWLEDGE_SIMULATION_CATALOG,
  type KnowledgeSimulationFixture,
} from './knowledge-simulation-catalog.js';
