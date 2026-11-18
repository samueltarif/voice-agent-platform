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
export {
  createKnowledgeEvaluationExtensionFixture,
  createKnowledgeEvaluationFixture,
  type KnowledgeEvaluationFixture,
} from './knowledge-evaluation-fixture.js';
export {
  EVALUATION_DOCUMENTS,
  type EvaluationDocument,
} from './fixtures/knowledge-evaluation-documents.js';
export {
  EVALUATION_QUESTIONS,
  type EvaluationKind,
  type EvaluationOrg,
  type EvaluationQuestion,
} from './fixtures/knowledge-evaluation-questions.js';
export {
  EVALUATION_EXTENSION_DOCUMENTS,
  EVALUATION_EXTENSION_QUESTIONS,
} from './fixtures/knowledge-evaluation-extension.js';
export { projectPreview, projectRetrieval } from './knowledge-retrieval-projection.js';
export { scoreQuestion, summarize, type QuestionOutcome } from './knowledge-evaluation-metrics.js';
