import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type pg from 'pg';
import { ConflictError, EntitlementExceededError } from '@voice-agent/errors';
import { createDatabaseConnection, type DatabaseInstance } from './client/connection.js';
import { CommercialEntitlementResolver } from './repositories/commercial-entitlement-resolver.js';
import { DefaultCommercialPublicationPolicy } from './repositories/commercial-publication-policy.js';
import { AgentRepository } from './repositories/agent-repository.js';
import { AgentLifecycleService } from './repositories/agent-lifecycle-service.js';
import { AgentVersionRepository } from './repositories/agent-version-repository.js';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import { AgentDraftDiscardService } from './repositories/agent-draft-discard-service.js';
import { AgentPublicationService } from './repositories/agent-publication-service.js';
import { allocateNextAgentVersionNumber } from './repositories/agent-version-allocator.js';
import {
  user,
  organizations,
  plans,
  entitlements,
  subscriptions,
  commercialGrants,
  agents,
  agentVersions,
  auditLogs,
} from './schema/index.js';

const isStaging =
  process.env.APP_ENV === 'staging' &&
  process.env.STAGING_SMOKE_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL);

const describeStaging = isStaging ? describe : describe.skip;

describeStaging(
  'Neon Staging Agent Domain & Commercial Persistence (Opt-In)',
  { timeout: 20000 },
  () => {
    let db: DatabaseInstance;
    let pool: pg.Pool;
    let resolver: CommercialEntitlementResolver;
    let publicationPolicy: DefaultCommercialPublicationPolicy;
    let agentRepo: AgentRepository;
    let lifecycleService: AgentLifecycleService;
    let versionRepo: AgentVersionRepository;
    let draftService: AgentDraftService;
    let discardService: AgentDraftDiscardService;
    let publicationService: AgentPublicationService;

    // Cryptographically unique run identifier for synthetic fixture tracking
    const runId = randomUUID();
    const testUserId = `smoke-u-agent-${runId}`;
    const now = new Date();

    // Track created IDs for safe cleanup
    const createdOrgIds: string[] = [];
    const createdUserIds: string[] = [testUserId];
    const createdPlanIds: string[] = [];

    const validConfig = {
      persona: {
        role: 'Atendente Staging',
        companyName: 'Empresa Staging',
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
      const rawUrl = process.env.DATABASE_URL ?? '';
      try {
        const parsed = new URL(rawUrl);
        // Note: .endsWith('.neon.tech') verifies the managed Neon provider, but does not distinguish
        // staging vs production by itself. Staging isolation is enforced via APP_ENV and unprovisioned prod.
        const isNeonHost =
          parsed.hostname === 'neon.tech' || parsed.hostname.endsWith('.neon.tech');
        if (!isNeonHost) {
          throw new Error('Target database is not a verified Neon host.');
        }
      } catch {
        throw new Error('DATABASE_URL is not a valid Neon connection string.');
      }

      const client = createDatabaseConnection({ maxConnections: 3 });
      db = client.db;
      pool = client.pool;

      resolver = new CommercialEntitlementResolver(db);
      publicationPolicy = new DefaultCommercialPublicationPolicy(db, resolver);
      agentRepo = new AgentRepository(db);
      lifecycleService = new AgentLifecycleService(db, resolver);
      versionRepo = new AgentVersionRepository(db);
      draftService = new AgentDraftService(db);
      discardService = new AgentDraftDiscardService(db);
      publicationService = new AgentPublicationService(db, publicationPolicy);

      await db.insert(user).values({
        id: testUserId,
        name: 'Staging Agent Smoke User',
        email: `${testUserId}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    afterAll(async () => {
      const cleanupErrors: Error[] = [];

      try {
        if (db) {
          // 1. Audit logs
          if (createdOrgIds.length > 0) {
            try {
              await db.delete(auditLogs).where(inArray(auditLogs.organizationId, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }

            // 2. Agent versions
            try {
              await db
                .delete(agentVersions)
                .where(inArray(agentVersions.organizationId, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }

            // 3. Agents
            try {
              await db.delete(agents).where(inArray(agents.organizationId, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }

            // 4. Commercial grants
            try {
              await db
                .delete(commercialGrants)
                .where(inArray(commercialGrants.organizationId, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }

            // 5. Subscriptions
            try {
              await db
                .delete(subscriptions)
                .where(inArray(subscriptions.organizationId, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }
          }

          // 6. Entitlements & Plans
          if (createdPlanIds.length > 0) {
            try {
              await db.delete(entitlements).where(inArray(entitlements.planId, createdPlanIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }

            try {
              await db.delete(plans).where(inArray(plans.id, createdPlanIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }
          }

          // 7. Organizations
          if (createdOrgIds.length > 0) {
            try {
              await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }
          }

          // 8. User (cleaned up independently of whether any organizations were created)
          if (createdUserIds.length > 0) {
            try {
              await db.delete(user).where(inArray(user.id, createdUserIds));
            } catch (err) {
              cleanupErrors.push(err instanceof Error ? err : new Error(String(err)));
            }
          }

          // 9. Zero-leftover verification: query Neon catalog to prove 0 residual rows
          const leftoverDetails: string[] = [];

          if (createdUserIds.length > 0) {
            const remainingUsers = await db
              .select({ id: user.id })
              .from(user)
              .where(inArray(user.id, createdUserIds));
            if (remainingUsers.length > 0) {
              leftoverDetails.push(`Remaining users: ${remainingUsers.length}`);
            }
          }

          if (createdOrgIds.length > 0) {
            const remainingOrgs = await db
              .select({ id: organizations.id })
              .from(organizations)
              .where(inArray(organizations.id, createdOrgIds));
            if (remainingOrgs.length > 0) {
              leftoverDetails.push(`Remaining organizations: ${remainingOrgs.length}`);
            }

            const remainingAgents = await db
              .select({ id: agents.id })
              .from(agents)
              .where(inArray(agents.organizationId, createdOrgIds));
            if (remainingAgents.length > 0) {
              leftoverDetails.push(`Remaining agents: ${remainingAgents.length}`);
            }

            const remainingVersions = await db
              .select({ id: agentVersions.id })
              .from(agentVersions)
              .where(inArray(agentVersions.organizationId, createdOrgIds));
            if (remainingVersions.length > 0) {
              leftoverDetails.push(`Remaining agent_versions: ${remainingVersions.length}`);
            }

            const remainingGrants = await db
              .select({ id: commercialGrants.id })
              .from(commercialGrants)
              .where(inArray(commercialGrants.organizationId, createdOrgIds));
            if (remainingGrants.length > 0) {
              leftoverDetails.push(`Remaining commercial_grants: ${remainingGrants.length}`);
            }

            const remainingSubs = await db
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(inArray(subscriptions.organizationId, createdOrgIds));
            if (remainingSubs.length > 0) {
              leftoverDetails.push(`Remaining subscriptions: ${remainingSubs.length}`);
            }

            const remainingAudit = await db
              .select({ id: auditLogs.id })
              .from(auditLogs)
              .where(inArray(auditLogs.organizationId, createdOrgIds));
            if (remainingAudit.length > 0) {
              leftoverDetails.push(`Remaining audit_logs: ${remainingAudit.length}`);
            }
          }

          if (createdPlanIds.length > 0) {
            const remainingPlans = await db
              .select({ id: plans.id })
              .from(plans)
              .where(inArray(plans.id, createdPlanIds));
            if (remainingPlans.length > 0) {
              leftoverDetails.push(`Remaining plans: ${remainingPlans.length}`);
            }

            const remainingEntitlements = await db
              .select({ id: entitlements.id })
              .from(entitlements)
              .where(inArray(entitlements.planId, createdPlanIds));
            if (remainingEntitlements.length > 0) {
              leftoverDetails.push(`Remaining entitlements: ${remainingEntitlements.length}`);
            }
          }

          if (leftoverDetails.length > 0) {
            cleanupErrors.push(
              new Error(`STAGING FIXTURE LEFTOVER DETECTED:\n${leftoverDetails.join('\n')}`),
            );
          }
        }
      } finally {
        if (pool) {
          await pool.end();
        }
      }

      if (cleanupErrors.length > 0) {
        throw new Error(
          `[Staging Cleanup Failed] ${cleanupErrors.length} error(s):\n${cleanupErrors.map((e) => e.message).join('\n')}`,
        );
      }
    });

    async function createTestOrg(slugPrefix: string) {
      const slug = `${slugPrefix}-${runId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
      const [org] = await db
        .insert(organizations)
        .values({
          name: `Org ${slug}`,
          slug,
          status: 'ACTIVE',
        })
        .returning();
      createdOrgIds.push(org!.id);
      return org!;
    }

    async function grantQuota(organizationId: string, quota: number) {
      await db.insert(commercialGrants).values({
        organizationId,
        featureKey: 'agents.max',
        overrideValue: String(quota),
        startsAt: new Date('2026-01-01'),
        endsAt: null,
        grantedBy: testUserId,
        reason: `Smoke Quota ${quota}`,
      });
    }

    it('validates schema constraints and tenant uniqueness in Neon staging', async () => {
      const orgA = await createTestOrg('schema-a');
      const orgB = await createTestOrg('schema-b');

      // 1. Same slug in same org rejected
      const [agentA1] = await db
        .insert(agents)
        .values({
          organizationId: orgA.id,
          name: 'Agent Slug A',
          slug: 'unique-slug',
          status: 'ACTIVE',
        })
        .returning();
      expect(agentA1).toBeDefined();

      await expect(
        db.insert(agents).values({
          organizationId: orgA.id,
          name: 'Agent Slug A duplicate',
          slug: 'unique-slug',
          status: 'ACTIVE',
        }),
      ).rejects.toThrow();

      // 2. Same slug in different org permitted
      const [agentB1] = await db
        .insert(agents)
        .values({
          organizationId: orgB.id,
          name: 'Agent Slug B',
          slug: 'unique-slug',
          status: 'ACTIVE',
        })
        .returning();
      expect(agentB1).toBeDefined();

      // 3. Cross-tenant composite FK rejected (agent_id from orgA but organization_id from orgB)
      await expect(
        db.insert(agentVersions).values({
          agentId: agentA1!.id,
          organizationId: orgB.id,
          versionNumber: 1,
          status: 'DRAFT',
          configurationSchemaVersion: 1,
          configuration: validConfig,
          createdBy: testUserId,
        }),
      ).rejects.toThrow();

      // 4. Second DRAFT partial unique index rejection
      await db.insert(agentVersions).values({
        agentId: agentA1!.id,
        organizationId: orgA.id,
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: validConfig,
        createdBy: testUserId,
      });

      await expect(
        db.insert(agentVersions).values({
          agentId: agentA1!.id,
          organizationId: orgA.id,
          versionNumber: 2,
          status: 'DRAFT',
          configurationSchemaVersion: 1,
          configuration: validConfig,
          createdBy: testUserId,
        }),
      ).rejects.toThrow();
    });

    it('validates tenant read isolation via repository in Neon staging', async () => {
      const orgA = await createTestOrg('read-a');
      const orgB = await createTestOrg('read-b');

      const [agentA] = await db
        .insert(agents)
        .values({
          organizationId: orgA.id,
          name: 'Agent Read A',
          slug: 'read-slug-a',
          status: 'ACTIVE',
        })
        .returning();

      // Listing Org A returns agentA
      const listA = await agentRepo.listAgentsByOrganization({ organizationId: orgA.id });
      expect(listA.some((a) => a.id === agentA!.id)).toBe(true);

      // Listing Org B does NOT return agentA
      const listB = await agentRepo.listAgentsByOrganization({ organizationId: orgB.id });
      expect(listB.some((a) => a.id === agentA!.id)).toBe(false);

      // Fetching agentA using Org B tenant scope returns null
      const crossFetch = await agentRepo.getAgentById({
        organizationId: orgB.id,
        agentId: agentA!.id,
      });
      expect(crossFetch).toBeNull();
    });

    it('validates durable version allocation without audit_logs in Neon staging', async () => {
      const org = await createTestOrg('ver-alloc');
      await grantQuota(org.id, 5);

      const agent = await lifecycleService.createAgent({
        organizationId: org.id,
        name: 'Version Allocation Agent',
        slug: 'ver-alloc-agent',
        createdBy: testUserId,
        at: now,
      });

      // 1. Initial next_version_number is 1
      const [agentRow1] = await db.select().from(agents).where(eq(agents.id, agent.id));
      expect(agentRow1!.nextVersionNumber).toBe(1);

      // 2. Create Draft 1 -> versionNumber = 1, next_version_number advances to 2
      const draft1 = await draftService.createDraft({
        organizationId: org.id,
        agentId: agent.id,
        configuration: validConfig,
        createdBy: testUserId,
        at: now,
      });
      expect(draft1.versionNumber).toBe(1);

      const [agentRow2] = await db.select().from(agents).where(eq(agents.id, agent.id));
      expect(agentRow2!.nextVersionNumber).toBe(2);

      // 3. Discard Draft 1
      const discardRes = await discardService.discardDraft({
        organizationId: org.id,
        agentId: agent.id,
        versionId: draft1.id,
        actorId: testUserId,
        at: now,
      });
      expect(discardRes.success).toBe(true);

      // 4. Create next Draft -> MUST receive version 2, never reuse 1
      const draft2 = await draftService.createDraft({
        organizationId: org.id,
        agentId: agent.id,
        configuration: validConfig,
        createdBy: testUserId,
        at: now,
      });
      expect(draft2.versionNumber).toBe(2);

      const [agentRow3] = await db.select().from(agents).where(eq(agents.id, agent.id));
      expect(agentRow3!.nextVersionNumber).toBe(3);
    });

    it('validates transactional rollback of next_version_number on aborted transaction in Neon staging', async () => {
      const org = await createTestOrg('rollback-test');
      await grantQuota(org.id, 5);

      const agent = await lifecycleService.createAgent({
        organizationId: org.id,
        name: 'Rollback Staging Agent',
        slug: 'rollback-staging-agent',
        createdBy: testUserId,
        at: now,
      });

      // Simulate an aborted transaction after allocation
      await expect(
        db.transaction(async (tx) => {
          await allocateNextAgentVersionNumber(tx, org.id, agent.id);
          throw new Error('Simulated failure before commit in Neon staging');
        }),
      ).rejects.toThrow('Simulated failure before commit in Neon staging');

      // Confirm next_version_number rolled back to 1
      const [agentRow] = await db.select().from(agents).where(eq(agents.id, agent.id));
      expect(agentRow!.nextVersionNumber).toBe(1);

      // Create real draft: must receive version 1 (no gap created)
      const draft = await draftService.createDraft({
        organizationId: org.id,
        agentId: agent.id,
        configuration: validConfig,
        createdBy: testUserId,
        at: now,
      });
      expect(draft.versionNumber).toBe(1);
    });

    it('validates quota agents.max=1 concurrency serialization in Neon staging', async () => {
      const org = await createTestOrg('quota-conc');
      await grantQuota(org.id, 1);

      const p1 = lifecycleService.createAgent({
        organizationId: org.id,
        name: 'Conc Agent 1',
        slug: 'conc-agent-1',
        createdBy: testUserId,
        at: now,
      });
      const p2 = lifecycleService.createAgent({
        organizationId: org.id,
        name: 'Conc Agent 2',
        slug: 'conc-agent-2',
        createdBy: testUserId,
        at: now,
      });

      const results = await Promise.allSettled([p1, p2]);
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        EntitlementExceededError,
      );

      const activeAgents = await agentRepo.listAgentsByOrganization({
        organizationId: org.id,
        status: 'ACTIVE',
      });
      expect(activeAgents).toHaveLength(1);
    });

    it('validates commercial entitlement resolution & conflict fail-closed in Neon staging', async () => {
      const org = await createTestOrg('comm-res');

      // 1. Create a plan with agents.max = 3
      const [plan] = await db
        .insert(plans)
        .values({
          code: `plan-${runId.slice(0, 8)}-${randomUUID().slice(0, 8)}`,
          name: 'Staging Test Plan',
          billingMode: 'SELF_SERVICE',
          status: 'ACTIVE',
        })
        .returning();
      createdPlanIds.push(plan!.id);

      await db.insert(entitlements).values({
        planId: plan!.id,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 3,
      });

      // 2. Active Subscription resolves agents.max = 3
      const [sub] = await db
        .insert(subscriptions)
        .values({
          organizationId: org.id,
          planId: plan!.id,
          status: 'ACTIVE',
          billingMode: 'SELF_SERVICE',
          currentPeriodStart: new Date('2026-01-01'),
          currentPeriodEnd: new Date('2026-12-31'),
        })
        .returning();

      const entSub = await resolver.resolveNumericEntitlement(org.id, 'agents.max', { at: now });
      expect(entSub.granted).toBe(true);
      expect(entSub.limit).toBe(3);
      expect(entSub.sourceKind).toBe('SUBSCRIPTION_PLAN');

      // 3. Feature grant override takes precedence over subscription
      const [grantOverride] = await db
        .insert(commercialGrants)
        .values({
          organizationId: org.id,
          featureKey: 'agents.max',
          overrideValue: '10',
          startsAt: new Date('2026-01-01'),
          endsAt: null,
          grantedBy: testUserId,
          reason: 'Override precedence',
        })
        .returning();

      const entOverride = await resolver.resolveNumericEntitlement(org.id, 'agents.max', {
        at: now,
      });
      expect(entOverride.granted).toBe(true);
      expect(entOverride.limit).toBe(10);
      expect(entOverride.sourceKind).toBe('FEATURE_GRANT');

      // 4. Conflict: add a second active feature override for the same feature -> ConflictError (fail-closed)
      await db.insert(commercialGrants).values({
        organizationId: org.id,
        featureKey: 'agents.max',
        overrideValue: '20',
        startsAt: new Date('2026-01-01'),
        endsAt: null,
        grantedBy: testUserId,
        reason: 'Conflict trigger',
      });

      await expect(
        resolver.resolveNumericEntitlement(org.id, 'agents.max', { at: now }),
      ).rejects.toThrow(ConflictError);

      // Clean conflict rows for subsequent sanity
      await db.delete(commercialGrants).where(eq(commercialGrants.id, grantOverride!.id));
      await db.delete(subscriptions).where(eq(subscriptions.id, sub!.id));
    });

    it('validates atomic publication and version supersession in Neon staging', async () => {
      const org = await createTestOrg('pub-atomic');
      await grantQuota(org.id, 5);

      const agent = await lifecycleService.createAgent({
        organizationId: org.id,
        name: 'Publication Agent',
        slug: 'pub-agent',
        createdBy: testUserId,
        at: now,
      });

      // 1. Create and publish draft v1
      const draft1 = await draftService.createDraft({
        organizationId: org.id,
        agentId: agent.id,
        configuration: validConfig,
        createdBy: testUserId,
        at: now,
      });

      const pub1 = await publicationService.publishDraft({
        organizationId: org.id,
        agentId: agent.id,
        draftVersionId: draft1.id,
        publishedBy: testUserId,
        at: now,
      });
      expect(pub1.status).toBe('PUBLISHED');
      expect(pub1.publishedAt).toBeDefined();
      expect(pub1.publishedBy).toBe(testUserId);

      // 2. Create draft v2 and publish it
      const draft2 = await draftService.createDraft({
        organizationId: org.id,
        agentId: agent.id,
        configuration: validConfig,
        createdBy: testUserId,
        at: now,
      });
      expect(draft2.versionNumber).toBe(2);

      const pub2 = await publicationService.publishDraft({
        organizationId: org.id,
        agentId: agent.id,
        draftVersionId: draft2.id,
        publishedBy: testUserId,
        at: now,
      });
      expect(pub2.status).toBe('PUBLISHED');
      expect(pub2.id).toBe(draft2.id);

      // 3. Confirm previous v1 was transitioned to ARCHIVED
      const allVersions = await versionRepo.listVersionsByAgent({
        organizationId: org.id,
        agentId: agent.id,
      });
      const v1 = allVersions.find((v) => v.id === draft1.id);
      const v2 = allVersions.find((v) => v.id === draft2.id);

      expect(v1?.status).toBe('ARCHIVED');
      expect(v2?.status).toBe('PUBLISHED');

      // Confirm exactly 1 published version in Neon staging
      const currentPublished = await versionRepo.getCurrentPublishedVersion({
        organizationId: org.id,
        agentId: agent.id,
      });
      expect(currentPublished?.id).toBe(draft2.id);
    });
  },
);
