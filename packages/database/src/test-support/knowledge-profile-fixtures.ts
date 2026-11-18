import type {
  AgentKnowledgeRetrievalProfile,
  KnowledgeProfilePolicy,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { AgentDraftService } from '../repositories/agent-draft-service.js';
import { AgentLifecycleService } from '../repositories/agent-lifecycle-service.js';
import { AgentPublicationService } from '../repositories/agent-publication-service.js';
import { CommercialEntitlementResolver } from '../repositories/commercial-entitlement-resolver.js';
import { DefaultCommercialPublicationPolicy } from '../repositories/commercial-publication-policy.js';
import { ingestKnowledgeDocument } from '../repositories/knowledge-ingestion-service.js';
import {
  ADVERSARIAL_DOCUMENTS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
} from './fixtures/knowledge-adversarial-corpus.js';
import { HOSTILE_EVALUATION_DOCUMENTS } from './fixtures/knowledge-hostile-evaluation-corpus.js';
import {
  knowledgeSimulationConfig,
  type KnowledgeSimulationFixture,
} from './knowledge-simulation-catalog.js';
import { createKnowledgeSimulationFixture } from './knowledge-simulation-fixtures.js';

/**
 * SOMENTE TESTES (B2a, DEC-071). Política ABERTA para as organizações dadas:
 * existe só em bancos descartáveis. Em produção a lista é vazia e a chave,
 * desligada.
 */
export function openKnowledgeProfilePolicyFor(
  organizationIds: readonly string[],
  runtimeEnabled = true,
): KnowledgeProfilePolicy {
  return {
    isOrganizationAllowed: (id) => organizationIds.includes(id),
    isRuntimeEnabled: () => runtimeEnabled,
  };
}

/** Agente publicado com `knowledge.retrievalProfile`, pelos serviços oficiais. */
export async function createAgentWithKnowledgeProfile(
  db: DatabaseInstance,
  spec: {
    readonly organizationId: string;
    readonly userId: string;
    readonly slug: string;
    readonly profile: AgentKnowledgeRetrievalProfile;
  },
): Promise<string> {
  const policy = openKnowledgeProfilePolicyFor([spec.organizationId]);
  const resolver = new CommercialEntitlementResolver(db);
  const agent = await new AgentLifecycleService(db, resolver).createAgent({
    organizationId: spec.organizationId,
    name: spec.slug,
    slug: spec.slug,
    createdBy: spec.userId,
  });
  const draft = await new AgentDraftService(db, policy).createDraft({
    organizationId: spec.organizationId,
    agentId: agent.id,
    configuration: {
      ...knowledgeSimulationConfig(['knowledge.search']),
      knowledge: { retrievalProfile: spec.profile },
    },
    createdBy: spec.userId,
    actorRole: 'OWNER',
  });
  const commercial = new DefaultCommercialPublicationPolicy(db, resolver);
  await new AgentPublicationService(db, commercial, policy).publishDraft({
    organizationId: spec.organizationId,
    agentId: agent.id,
    draftVersionId: draft.id,
    publishedBy: spec.userId,
  });
  return agent.id;
}

export interface KnowledgeProfileFixture extends KnowledgeSimulationFixture {
  /** Organização A: agentes com perfil `v2` e `v1` explícito (os demais, sem o campo). */
  readonly v2A: string;
  readonly v1A: string;
  /** Organização B: agente `v2` (isolamento). */
  readonly v2B: string;
}

/**
 * Fixture da simulação (DEC-061) + corpus hostil e adversarial da B2b na
 * organização A + agentes com perfil explícito. Banco DESCARTÁVEL apenas.
 */
export async function createKnowledgeProfileFixture(
  db: DatabaseInstance,
  run: string,
): Promise<KnowledgeProfileFixture> {
  const base = await createKnowledgeSimulationFixture(db, run);
  const docs = [
    ...HOSTILE_EVALUATION_DOCUMENTS,
    ...ADVERSARIAL_DOCUMENTS,
    ...ADVERSARIAL_SUPPORT_DOCUMENTS,
  ];
  for (const doc of docs) {
    await ingestKnowledgeDocument(db, {
      organizationId: base.orgA,
      title: doc.title,
      source: { sourceType: doc.sourceType, locator: `profile/${run}/${doc.key}` },
      rawText: doc.text,
    });
  }
  const make = (organizationId: string, slug: string, profile: AgentKnowledgeRetrievalProfile) =>
    createAgentWithKnowledgeProfile(db, {
      organizationId,
      userId: base.userId,
      slug: `${slug}-${run}`,
      profile,
    });
  return {
    ...base,
    v2A: await make(base.orgA, 'perfil-v2', 'v2'),
    v1A: await make(base.orgA, 'perfil-v1', 'v1'),
    v2B: await make(base.orgB, 'perfil-v2-b', 'v2'),
  };
}
