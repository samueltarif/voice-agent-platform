import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { CommercialAccessDeniedError } from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { CommercialEntitlementResolver } from './repositories/commercial-entitlement-resolver.js';
import { DefaultCommercialPublicationPolicy } from './repositories/commercial-publication-policy.js';
import { AgentPublicationService } from './repositories/agent-publication-service.js';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import { user } from './schema/auth.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';
import { plans, entitlements, subscriptions, commercialGrants } from './schema/commercial.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('CommercialPublicationPolicy and AgentPublicationService Integration Tests', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const resolver = new CommercialEntitlementResolver(db);
  const publicationPolicy = new DefaultCommercialPublicationPolicy(db, resolver);
  const draftService = new AgentDraftService(db);
  const publicationService = new AgentPublicationService(db, publicationPolicy);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const now = new Date('2026-09-23T12:00:00Z');
  const past = new Date('2026-09-01T00:00:00Z');
  const future = new Date('2026-10-01T00:00:00Z');
  const userId = `usr_pub_test_${testSuffix}`;

  let planStandardId: string;
  let planZeroId: string;
  let planMissingId: string;

  const validConfig = {
    persona: {
      role: 'Atendente Virtual',
      companyName: 'Empresa Teste',
      objective: 'Atender clientes com cortesia',
      tone: 'FORMAL' as const,
      greetingPhrase: 'Olá, em que posso ajudar?',
      closingPhrase: 'Obrigado pelo contato.',
      fallbackPhrase: 'Desculpe, não compreendi. Pode repetir?',
    },
    voice: {
      languageCode: 'pt-BR' as const,
    },
    rules: {
      conversational: ['Seja cordial e objetiva'],
      deterministic: {
        maxDiscountPercent: 10,
        operatingHours: '08:00-18:00',
      },
    },
    playbook: {
      stages: [
        {
          name: 'Abertura',
          goal: 'Identificar-se como assistente virtual',
        },
      ],
    },
    examples: [
      {
        customerInput: 'Ola',
        idealAgentResponse: 'Ola, como posso ajudar voce hoje?',
      },
    ],
  };

  beforeAll(async () => {
    await db
      .insert(user)
      .values([
        { id: userId, name: 'Publisher Tester', email: `publisher_${testSuffix}@example.com` },
      ]);

    const [std] = await db
      .insert(plans)
      .values({
        code: `pub-std-${testSuffix}`,
        name: 'Standard Plan',
        billingMode: 'SELF_SERVICE',
        status: 'ACTIVE',
      })
      .returning();
    planStandardId = std!.id;

    const [zero] = await db
      .insert(plans)
      .values({
        code: `pub-zero-${testSuffix}`,
        name: 'Zero Plan',
        billingMode: 'COMPLIMENTARY',
        status: 'ACTIVE',
      })
      .returning();
    planZeroId = zero!.id;

    const [missing] = await db
      .insert(plans)
      .values({
        code: `pub-missing-${testSuffix}`,
        name: 'Missing Entitlements Plan',
        billingMode: 'SELF_SERVICE',
        status: 'ACTIVE',
      })
      .returning();
    planMissingId = missing!.id;

    await db.insert(entitlements).values([
      {
        planId: planStandardId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 2,
      },
      {
        planId: planZeroId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 0,
      },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createOrgAndAgent() {
    const slug = `org-pub-${Math.random().toString(36).substring(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: `Org ${slug}`, slug, status: 'ACTIVE' })
      .returning();

    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: org!.id,
        name: 'Agent 1',
        slug: 'agent-1',
        status: 'ACTIVE',
      })
      .returning();

    return { org: org!, agent: agent! };
  }

  it('agents.max > 0: publication is allowed', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId, // limit 2
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const published = await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });

    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeDefined();
    expect(published.publishedBy).toBe(userId);
  });

  it('agents.max = 0: publication is denied', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planZeroId, // limit 0
      status: 'ACTIVE',
      billingMode: 'COMPLIMENTARY',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    await expect(
      publicationService.publishDraft({
        organizationId: org.id,
        agentId: agent.id,
        draftVersionId: draft.id,
        publishedBy: userId,
        at: now,
      }),
    ).rejects.toThrow(CommercialAccessDeniedError);
  });

  it('entitlement absent: publication is denied', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planMissingId, // no agents.max entitlement
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    await expect(
      publicationService.publishDraft({
        organizationId: org.id,
        agentId: agent.id,
        draftVersionId: draft.id,
        publishedBy: userId,
        at: now,
      }),
    ).rejects.toThrow(CommercialAccessDeniedError);
  });

  it('PAST_DUE without grant: publication is denied', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'PAST_DUE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    await expect(
      publicationService.publishDraft({
        organizationId: org.id,
        agentId: agent.id,
        draftVersionId: draft.id,
        publishedBy: userId,
        at: now,
      }),
    ).rejects.toThrow(CommercialAccessDeniedError);
  });

  it('PAST_DUE + active grant: publication is allowed according to grant', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'PAST_DUE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '5',
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_pub',
      reason: 'Grace period override',
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const published = await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });

    expect(published.status).toBe('PUBLISHED');
  });

  it('tenant above quota due to downgrade can still publish new version of existing active agent', async () => {
    const { org, agent } = await createOrgAndAgent();
    // Insert a second active agent so count(ACTIVE) = 2
    await db.insert(agents).values({
      organizationId: org.id,
      name: 'Agent 2',
      slug: 'agent-2',
      status: 'ACTIVE',
    });

    // Tenant downgraded to limit = 1 (current count is 2 >= limit 1)
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '1',
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_pub',
      reason: 'Downgraded quota',
    });

    // Existing active agent can create and publish draft
    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const published = await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });

    expect(published.status).toBe('PUBLISHED');
  });

  it('Publish does NOT create a new Agent aggregate or consume quota', async () => {
    const { org, agent } = await createOrgAndAgent();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const draft1 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft1.id,
      publishedBy: userId,
      at: now,
    });

    // Create and publish a second version of the same agent
    const draft2 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const published2 = await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft2.id,
      publishedBy: userId,
      at: now,
    });

    expect(published2.versionNumber).toBe(2);
    expect(published2.status).toBe('PUBLISHED');

    // Confirm that the first version was superseded to ARCHIVED
    const versionRows = await db
      .select({ id: agentVersions.id, status: agentVersions.status })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agent.id));

    expect(versionRows).toHaveLength(2);
    const v1 = versionRows.find((v) => v.id === draft1.id);
    const v2 = versionRows.find((v) => v.id === draft2.id);
    expect(v1?.status).toBe('ARCHIVED');
    expect(v2?.status).toBe('PUBLISHED');

    // Count agents in org: exactly 1 agent
    const orgAgents = await db.select().from(agents).where(eq(agents.organizationId, org.id));
    expect(orgAgents).toHaveLength(1);
  });
});
