import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ConflictError,
  EntitlementExceededError,
  InvalidStateTransitionError,
} from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { CommercialEntitlementResolver } from './repositories/commercial-entitlement-resolver.js';
import { DefaultCommercialPublicationPolicy } from './repositories/commercial-publication-policy.js';
import { AgentRepository } from './repositories/agent-repository.js';
import { AgentLifecycleService } from './repositories/agent-lifecycle-service.js';
import { AgentVersionRepository } from './repositories/agent-version-repository.js';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import { AgentDraftDiscardService } from './repositories/agent-draft-discard-service.js';
import { AgentPublicationService } from './repositories/agent-publication-service.js';
import { user } from './schema/auth.js';
import { organizations } from './schema/organizations.js';
import { commercialGrants } from './schema/commercial.js';
import { auditLogs } from './schema/audit.js';
import { eq } from 'drizzle-orm';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Agent Lifecycle, Immutability & Concurrency (Postgres Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const resolver = new CommercialEntitlementResolver(db);
  const publicationPolicy = new DefaultCommercialPublicationPolicy(db, resolver);

  const agentRepo = new AgentRepository(db);
  const lifecycleService = new AgentLifecycleService(db, resolver);
  const versionRepo = new AgentVersionRepository(db);
  const draftService = new AgentDraftService(db);
  const discardService = new AgentDraftDiscardService(db);
  const publicationService = new AgentPublicationService(db, publicationPolicy);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userId = `usr_conc_test_${testSuffix}`;
  const now = new Date('2026-09-23T12:00:00Z');

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
        { id: userId, name: 'Concurrency Tester', email: `concurrency_${testSuffix}@example.com` },
      ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createOrgWithQuota(agentsMax: number) {
    const slug = `org-conc-${Math.random().toString(36).substring(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: `Org ${slug}`, slug, status: 'ACTIVE' })
      .returning();

    await db.insert(commercialGrants).values({
      organizationId: org!.id,
      featureKey: 'agents.max',
      overrideValue: String(agentsMax),
      startsAt: new Date('2026-01-01'),
      endsAt: null,
      grantedBy: 'admin_conc',
      reason: `Quota ${agentsMax}`,
    });

    return org!;
  }

  it('agents.max=1 + two concurrent creates: only one succeeds, other fails closed', async () => {
    const org = await createOrgWithQuota(1);

    const promise1 = lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Agent Conc 1',
      slug: 'agent-conc-1',
      createdBy: userId,
      at: now,
    });

    const promise2 = lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Agent Conc 2',
      slug: 'agent-conc-2',
      createdBy: userId,
      at: now,
    });

    const results = await Promise.allSettled([promise1, promise2]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const failureReason = (failures[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(EntitlementExceededError);

    // Verify database active count
    const activeAgents = await agentRepo.listAgentsByOrganization({
      organizationId: org.id,
      status: 'ACTIVE',
    });
    expect(activeAgents).toHaveLength(1);
  });

  it('create and reactivate concurrently: quota is strictly respected', async () => {
    const org = await createOrgWithQuota(1);

    // Create an agent and archive it
    const agentA = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Agent A',
      slug: 'agent-a',
      createdBy: userId,
      at: now,
    });
    await agentRepo.archiveAgent({
      organizationId: org.id,
      agentId: agentA.id,
      actorId: userId,
    });

    // Now quota is 1, active count is 0. Concurrently reactivate agentA and create agentB:
    const reactivatePromise = lifecycleService.reactivateAgent({
      organizationId: org.id,
      agentId: agentA.id,
      actorId: userId,
      at: now,
    });
    const createPromise = lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Agent B',
      slug: 'agent-b',
      createdBy: userId,
      at: now,
    });

    const results = await Promise.allSettled([reactivatePromise, createPromise]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(EntitlementExceededError);

    const activeAgents = await agentRepo.listAgentsByOrganization({
      organizationId: org.id,
      status: 'ACTIVE',
    });
    expect(activeAgents).toHaveLength(1);
  });

  it('two concurrent createDraft calls: single draft invariant maintained', async () => {
    const org = await createOrgWithQuota(5);
    const agent = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Draft Agent',
      slug: 'draft-agent',
      createdBy: userId,
      at: now,
    });

    const p1 = draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });
    const p2 = draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const results = await Promise.allSettled([p1, p2]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    // Verify only 1 draft in DB
    const versions = await versionRepo.listVersionsByAgent({
      organizationId: org.id,
      agentId: agent.id,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.status).toBe('DRAFT');
  });

  it('versionNumber: monotonic and NOT reused after draft discard', async () => {
    const org = await createOrgWithQuota(5);
    const agent = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Monotonic Agent',
      slug: 'monotonic-agent',
      createdBy: userId,
      at: now,
    });

    // Create Draft 1
    const draft1 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });
    expect(draft1.versionNumber).toBe(1);

    // Discard Draft 1
    const discardRes = await discardService.discardDraft({
      organizationId: org.id,
      agentId: agent.id,
      versionId: draft1.id,
      actorId: userId,
      at: now,
    });
    expect(discardRes.success).toBe(true);
    expect(discardRes.discardedVersionNumber).toBe(1);

    // Confirm Draft 1 was hard deleted from agent_versions
    const versionsAfterDiscard = await versionRepo.listVersionsByAgent({
      organizationId: org.id,
      agentId: agent.id,
    });
    expect(versionsAfterDiscard).toHaveLength(0);

    // Create Draft 2: MUST receive versionNumber = 2 (not 1!)
    const draft2 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });
    expect(draft2.versionNumber).toBe(2);

    // Publish Draft 2
    const pub2 = await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft2.id,
      publishedBy: userId,
      at: now,
    });
    expect(pub2.versionNumber).toBe(2);
    expect(pub2.status).toBe('PUBLISHED');

    // Create Draft 3
    const draft3 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });
    expect(draft3.versionNumber).toBe(3);

    // Discard Draft 3
    await discardService.discardDraft({
      organizationId: org.id,
      agentId: agent.id,
      versionId: draft3.id,
      actorId: userId,
      at: now,
    });

    // Create Draft 4: MUST receive versionNumber = 4
    const draft4 = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });
    expect(draft4.versionNumber).toBe(4);
  });

  it('two concurrent publishDraft calls: exactly one PUBLISHED is maintained', async () => {
    const org = await createOrgWithQuota(5);
    const agent = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Publish Conc Agent',
      slug: 'pub-conc-agent',
      createdBy: userId,
      at: now,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    const p1 = publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });
    const p2 = publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });

    const results = await Promise.allSettled([p1, p2]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InvalidStateTransitionError,
    );

    const published = await versionRepo.getCurrentPublishedVersion({
      organizationId: org.id,
      agentId: agent.id,
    });
    expect(published?.id).toBe(draft.id);
    expect(published?.status).toBe('PUBLISHED');
  });

  it('immutability: updating a PUBLISHED version throws InvalidStateTransitionError', async () => {
    const org = await createOrgWithQuota(5);
    const agent = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Immutability Agent',
      slug: 'immutable-agent',
      createdBy: userId,
      at: now,
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

    await expect(
      draftService.updateDraftConfiguration({
        organizationId: org.id,
        agentId: agent.id,
        versionId: published.id,
        configuration: {
          ...validConfig,
          persona: { ...validConfig.persona, role: 'Novo Cargo' },
        },
      }),
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it('audit logs are created for all lifecycle events without sensitive prompts or secrets', async () => {
    const org = await createOrgWithQuota(5);
    const agent = await lifecycleService.createAgent({
      organizationId: org.id,
      name: 'Audited Agent',
      slug: 'audited-agent',
      createdBy: userId,
      at: now,
    });

    const draft = await draftService.createDraft({
      organizationId: org.id,
      agentId: agent.id,
      configuration: validConfig,
      createdBy: userId,
      at: now,
    });

    await publicationService.publishDraft({
      organizationId: org.id,
      agentId: agent.id,
      draftVersionId: draft.id,
      publishedBy: userId,
      at: now,
    });

    await agentRepo.archiveAgent({
      organizationId: org.id,
      agentId: agent.id,
      actorId: userId,
    });

    await lifecycleService.reactivateAgent({
      organizationId: org.id,
      agentId: agent.id,
      actorId: userId,
      at: now,
    });

    // Check audit logs
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, org.id));

    const actions = logs.map((l) => l.action);
    expect(actions).toContain('agent.created');
    expect(actions).toContain('agent.draft_created');
    expect(actions).toContain('agent.version_published');
    expect(actions).toContain('agent.archived');
    expect(actions).toContain('agent.reactivated');

    for (const log of logs) {
      if (log.metadata) {
        expect(log.metadata).not.toContain('Regra estrita');
        expect(log.metadata).not.toContain('Julia');
        expect(log.metadata).not.toContain('secret');
        expect(log.metadata).not.toContain('api_key');
      }
    }
  });
});
