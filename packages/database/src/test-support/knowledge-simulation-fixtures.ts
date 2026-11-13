import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
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

/** Catálogo fictício no formato do catálogo da homologação (produtos + FAQ comercial). */
export const KNOWLEDGE_SIMULATION_CATALOG = [
  'Qualitec Instrumentação. A Qualitec oferece soluções completas para óleo e gás em todo o Brasil.',
  'Transmissor de Pressão Manométrica QT-310 da Qualitec. Faixa de 0 a 400 bar, saída 4-20 mA.',
  'Transmissor de Pressão Diferencial QT-520 da Qualitec. Faixa de 0 a 25 bar, medição de vazão.',
  'Válvula Esfera Bipartida VE-200 da Qualitec. Corpo em aço inox 316, classe 300.',
  'Perguntas frequentes sobre preços: os preços da Qualitec são enviados por orçamento.',
  'Prazo de entrega e disponibilidade: itens em estoque saem em 5 dias úteis.',
] as const;

export function knowledgeSimulationConfig(
  tools: AgentConfigurationSnapshotV1['tools'],
): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Assistente de Vendas',
      companyName: 'Qualitec',
      objective: 'Responder dúvidas sobre o catálogo',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Obrigado',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '08:00-18:00' } },
    tools,
  };
}

export interface KnowledgeSimulationFixture {
  readonly userId: string;
  readonly orgA: string;
  readonly orgB: string;
  /** Organização A: vendas (com a ferramenta), suporte (documento fixado), sem ferramenta, só rascunho, arquivado. */
  readonly sales: string;
  readonly support: string;
  readonly noTool: string;
  readonly draftOnly: string;
  readonly archived: string;
  /** Organização B: vende helicópteros. */
  readonly salesB: string;
}

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
  const planId = await createPlan(db, run);
  const resolver = new CommercialEntitlementResolver(db);
  const lifecycle = new AgentLifecycleService(db, resolver);
  const drafts = new AgentDraftService(db);
  const policy = new DefaultCommercialPublicationPolicy(db, resolver);
  const publication = new AgentPublicationService(db, policy);

  async function org(tag: string) {
    const created = await new OrganizationRepository(db).createOrganization({
      slug: `kbsim-${tag}-${run}`,
      name: tag,
      status: 'ACTIVE',
    });
    await db.insert(subscriptions).values({
      organizationId: created!.id,
      planId,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    return created!.id;
  }

  async function agent(organizationId: string, slug: string, tools: string[], publish = true) {
    const created = await lifecycle.createAgent({
      organizationId,
      name: slug,
      slug,
      createdBy: userId,
    });
    const configuration = knowledgeSimulationConfig(tools as AgentConfigurationSnapshotV1['tools']);
    const draft = await drafts.createDraft({
      organizationId,
      agentId: created.id,
      configuration,
      createdBy: userId,
    });
    if (publish) {
      await publication.publishDraft({
        organizationId,
        agentId: created.id,
        draftVersionId: draft.id,
        publishedBy: userId,
      });
    }
    return created.id;
  }

  async function ingest(
    organizationId: string,
    locator: string,
    rawText: string,
    agentId?: string,
  ) {
    await ingestKnowledgeDocument(db, {
      organizationId,
      ...(agentId ? { agentId } : {}),
      title: `Catálogo ${locator}`,
      source: { sourceType: 'PRODUCT_MANUAL', locator: `${run}/${locator}` },
      rawText,
      chunkingPolicy: { policyVersion: 'v1', maxChunkChars: 120, overlapChars: 0 },
    });
  }

  const orgA = await org('a');
  const orgB = await org('b');
  const fixture: KnowledgeSimulationFixture = {
    userId,
    orgA,
    orgB,
    sales: await agent(orgA, `vendas-${run}`, ['knowledge.search']),
    support: await agent(orgA, `suporte-${run}`, ['knowledge.search']),
    noTool: await agent(orgA, `sem-ferramenta-${run}`, ['catalog.search']),
    draftOnly: await agent(orgA, `rascunho-${run}`, ['knowledge.search'], false),
    archived: await agent(orgA, `arquivado-${run}`, ['knowledge.search']),
    salesB: await agent(orgB, `vendas-b-${run}`, ['knowledge.search']),
  };
  await new AgentRepository(db).archiveAgent({
    organizationId: orgA,
    agentId: fixture.archived,
    actorId: userId,
  });
  for (const [i, text] of KNOWLEDGE_SIMULATION_CATALOG.entries()) {
    await ingest(orgA, `secao-${i}`, text);
  }
  await ingest(orgA, 'bombas', 'Bomba Centrífuga BC-90 para água industrial.', fixture.support);
  await ingest(
    orgB,
    'helicopteros',
    'Helicóptero H-125 à venda. Preço do helicóptero sob consulta.',
  );
  return fixture;
}
