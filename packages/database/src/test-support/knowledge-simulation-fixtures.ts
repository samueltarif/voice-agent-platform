import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  KNOWLEDGE_SIMULATION_CATALOG,
  knowledgeSimulationConfig,
  type KnowledgeSimulationFixture,
} from './knowledge-simulation-catalog.js';
import type { DatabaseInstance } from '../client/connection.js';
import { AgentDraftService } from '../repositories/agent-draft-service.js';
import { AgentLifecycleService } from '../repositories/agent-lifecycle-service.js';
import { AgentPublicationService } from '../repositories/agent-publication-service.js';
import { AgentRepository } from '../repositories/agent-repository.js';
import { CommercialEntitlementResolver } from '../repositories/commercial-entitlement-resolver.js';
import { DefaultCommercialPublicationPolicy } from '../repositories/commercial-publication-policy.js';
import { ingestKnowledgeDocument } from '../repositories/knowledge-ingestion-service.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { user } from '../schema/auth.js';
import { entitlements, plans, subscriptions } from '../schema/commercial.js';

async function createPlan(db: DatabaseInstance, run: string) {
  const [plan] = await db
    .insert(plans)
    .values({ code: `kbsim-${run}`, name: 'KB-SIM', billingMode: 'SELF_SERVICE', status: 'ACTIVE' })
    .returning();
  await db.insert(entitlements).values({
    planId: plan!.id,
    featureKey: 'agents.max',
    valueType: 'NUMERIC',
    numericLimit: 10,
  });
  return plan!.id;
}

interface SeedContext {
  readonly db: DatabaseInstance;
  readonly run: string;
  readonly userId: string;
  readonly planId: string;
}

async function createOrg(seed: SeedContext, tag: string): Promise<string> {
  const created = await new OrganizationRepository(seed.db).createOrganization({
    slug: `kbsim-${tag}-${seed.run}`,
    name: tag,
    status: 'ACTIVE',
  });
  await seed.db.insert(subscriptions).values({
    organizationId: created!.id,
    planId: seed.planId,
    status: 'ACTIVE',
    billingMode: 'SELF_SERVICE',
    currentPeriodStart: new Date(Date.now() - 86_400_000),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  return created!.id;
}

interface AgentSpec {
  readonly organizationId: string;
  readonly slug: string;
  readonly tools: readonly string[];
  readonly publish?: boolean;
}

/** Agente → rascunho → (publicação), sempre pelos serviços oficiais. */
async function createAgent(seed: SeedContext, spec: AgentSpec): Promise<string> {
  const resolver = new CommercialEntitlementResolver(seed.db);
  const created = await new AgentLifecycleService(seed.db, resolver).createAgent({
    organizationId: spec.organizationId,
    name: spec.slug,
    slug: spec.slug,
    createdBy: seed.userId,
  });
  const draft = await new AgentDraftService(seed.db).createDraft({
    organizationId: spec.organizationId,
    agentId: created.id,
    configuration: knowledgeSimulationConfig([
      ...spec.tools,
    ] as AgentConfigurationSnapshotV1['tools']),
    createdBy: seed.userId,
  });
  if (spec.publish === false) return created.id;
  const policy = new DefaultCommercialPublicationPolicy(seed.db, resolver);
  await new AgentPublicationService(seed.db, policy).publishDraft({
    organizationId: spec.organizationId,
    agentId: created.id,
    draftVersionId: draft.id,
    publishedBy: seed.userId,
  });
  return created.id;
}

interface DocumentSpec {
  readonly organizationId: string;
  readonly locator: string;
  readonly rawText: string;
  readonly agentId?: string | undefined;
}

async function ingest(seed: SeedContext, doc: DocumentSpec): Promise<void> {
  await ingestKnowledgeDocument(seed.db, {
    organizationId: doc.organizationId,
    ...(doc.agentId ? { agentId: doc.agentId } : {}),
    title: `Catálogo ${doc.locator}`,
    source: { sourceType: 'PRODUCT_MANUAL', locator: `${seed.run}/${doc.locator}` },
    rawText: doc.rawText,
    chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 120, overlapChars: 0 },
  });
}

async function seedAgents(seed: SeedContext, orgA: string, orgB: string) {
  const knowledge = ['knowledge.search'];
  const make = (spec: AgentSpec) =>
    createAgent(seed, { ...spec, slug: `${spec.slug}-${seed.run}` });
  return {
    sales: await make({ organizationId: orgA, slug: 'vendas', tools: knowledge }),
    support: await make({ organizationId: orgA, slug: 'suporte', tools: knowledge }),
    noTool: await make({ organizationId: orgA, slug: 'sem-ferramenta', tools: ['catalog.search'] }),
    draftOnly: await make({
      organizationId: orgA,
      slug: 'rascunho',
      tools: knowledge,
      publish: false,
    }),
    archived: await make({ organizationId: orgA, slug: 'arquivado', tools: knowledge }),
    salesB: await make({ organizationId: orgB, slug: 'vendas-b', tools: knowledge }),
  };
}

async function seedDocuments(seed: SeedContext, fx: KnowledgeSimulationFixture): Promise<void> {
  for (const [i, rawText] of KNOWLEDGE_SIMULATION_CATALOG.entries()) {
    await ingest(seed, { organizationId: fx.orgA, locator: `secao-${i}`, rawText });
  }
  await ingest(seed, {
    organizationId: fx.orgA,
    locator: 'bombas',
    rawText: 'Bomba Centrífuga BC-90 para água industrial.',
    agentId: fx.support,
  });
  await ingest(seed, {
    organizationId: fx.orgB,
    locator: 'helicopteros',
    rawText: 'Helicóptero H-125 à venda. Preço do helicóptero sob consulta.',
  });
}

/**
 * Somente para bancos DESCARTÁVEIS de teste. Organizações, agentes, rascunhos,
 * publicações e documentos são criados pelos serviços oficiais; só usuário,
 * plano e assinatura (pré-requisitos comerciais) são inseridos diretamente.
 */
export async function createKnowledgeSimulationFixture(
  db: DatabaseInstance,
  run: string,
): Promise<KnowledgeSimulationFixture> {
  const userId = `usr_kbsim_${run}`;
  await db.insert(user).values({ id: userId, name: 'KB-SIM', email: `kbsim_${run}@example.com` });
  const seed: SeedContext = { db, run, userId, planId: await createPlan(db, run) };
  const orgA = await createOrg(seed, 'a');
  const orgB = await createOrg(seed, 'b');
  const fixture: KnowledgeSimulationFixture = {
    userId,
    orgA,
    orgB,
    ...(await seedAgents(seed, orgA, orgB)),
  };
  await new AgentRepository(db).archiveAgent({
    organizationId: orgA,
    agentId: fixture.archived,
    actorId: userId,
  });
  await seedDocuments(seed, fixture);
  return fixture;
}
