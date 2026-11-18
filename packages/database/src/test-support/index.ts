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
  createKnowledgeHostileEvaluationFixture,
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
  ADVERSARIAL_ATTACKS,
  ADVERSARIAL_DOCUMENTS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
  COMMERCIAL_VARIATION_QUESTIONS,
  LEGITIMATE_TRIGGER_PARAGRAPHS,
  TECHNICAL_QUESTIONS,
  type AdversarialAttack,
} from './fixtures/knowledge-adversarial-corpus.js';
export {
  HOSTILE_EVALUATION_DOCUMENTS,
  HOSTILE_EVALUATION_QUESTIONS,
  type HostileAttackKind,
  type HostileEvaluationDocument,
  type HostileEvaluationQuestion,
} from './fixtures/knowledge-hostile-evaluation-corpus.js';
export {
  EVALUATION_EXTENSION_DOCUMENTS,
  EVALUATION_EXTENSION_QUESTIONS,
} from './fixtures/knowledge-evaluation-extension.js';
export { projectPreview, projectRetrieval } from './knowledge-retrieval-projection.js';
export { scoreQuestion, summarize, type QuestionOutcome } from './knowledge-evaluation-metrics.js';
export {
  rawTextLeaks,
  scoreHostileQuestion,
  summarizeHostile,
  type HostileOutcome,
} from './knowledge-hostile-evaluation-metrics.js';
export {
  ALL_ADVERSARIAL_QUESTIONS,
  ATTACK_PARAGRAPHS,
  LEGITIMATE_PARAGRAPHS,
} from './knowledge-adversarial-evaluation-sets.js';
export { adversarialReport } from './knowledge-adversarial-evaluation.js';
export { auditAgentProjectionFields } from './knowledge-projection-field-audit.js';
export {
  createAgentWithKnowledgeProfile,
  createKnowledgeProfileFixture,
  openKnowledgeProfilePolicyFor,
  type KnowledgeProfileFixture,
} from './knowledge-profile-fixtures.js';
