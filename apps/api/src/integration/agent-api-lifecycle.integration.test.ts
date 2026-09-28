import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentVersionConfigurationResponse,
  ApiErrorResponse,
} from '@voice-agent/contracts';
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
  user,
  organizations,
  organizationMemberships,
  commercialGrants,
  UserOrganizationContextRepository,
} from '@voice-agent/database';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Agent Studio API Lifecycle & Quota (PostgreSQL Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const resolver = new CommercialEntitlementResolver(db);
  const publicationPolicy = new DefaultCommercialPublicationPolicy(db, resolver);

  const agentRepo = new AgentRepository(db);
  const versionRepo = new AgentVersionRepository(db);
  const lifecycleService = new AgentLifecycleService(db, resolver);
  const draftService = new AgentDraftService(db);
  const discardService = new AgentDraftDiscardService(db);
  const publicationService = new AgentPublicationService(db, publicationPolicy);
  const membershipRepo = new MembershipRepository(db);
  const organizationRepo = new OrganizationRepository(db);
  const userOrgContextRepo = new UserOrganizationContextRepository(db);

  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'integration-key-1';
  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userId = `usr_int_life_${testSuffix}`;

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [userId];

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });
    const bootstrapVerifier = new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    app = createApp({
      logger: createNullLogger(),
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

    await db.insert(user).values({
      id: userId,
      name: 'Lifecycle Tester',
      email: `life_${testSuffix}@example.com`,
    });
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await pool.query('DELETE FROM agent_versions WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM agents WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM audit_logs WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM commercial_grants WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query(
        'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
    }
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
    await pool.end();
  });

  async function createOrgWithQuota(agentsMax: number, role = 'ADMIN') {
    const slug = `org-life-${Math.random().toString(36).substring(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: `Org ${slug}`, slug, status: 'ACTIVE' })
      .returning();

    createdOrgIds.push(org!.id);

    await db.insert(commercialGrants).values({
      organizationId: org!.id,
      featureKey: 'agents.max',
      overrideValue: String(agentsMax),
      startsAt: new Date('2026-01-01'),
      endsAt: null,
      grantedBy: 'admin_test',
      reason: `Quota ${agentsMax}`,
    });

    await db.insert(organizationMemberships).values({
      organizationId: org!.id,
      userId,
      role: role as 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER',
      status: 'ACTIVE',
    });

    return org!;
  }

  async function getAssertion(orgId: string, actorId = userId): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: actorId,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 30,
      jti: `jti-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('runs end-to-end HTTP lifecycle: quota enforcement, draft creation, patch, publication, archive, reactivate', async () => {
    // 1. Setup organization with agents.max = 1
    const org = await createOrgWithQuota(1, 'ADMIN');
    const token = await getAssertion(org.id);

    // 2. Create first Agent via HTTP
    const createRes1 = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agent Primary', slug: 'agent-primary' }),
    });
    expect(createRes1.status).toBe(201);
    const agent1 = (await createRes1.json()) as AgentMetadataResponse;
    expect(agent1.name).toBe('Agent Primary');
    expect(agent1.status).toBe('ACTIVE');

    // 3. Second Agent creation via HTTP must fail closed with 403 (quota agents.max=1 reached)
    const createRes2 = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agent Secondary', slug: 'agent-secondary' }),
    });
    expect(createRes2.status).toBe(403);
    const quotaErr = (await createRes2.json()) as ApiErrorResponse;
    expect(quotaErr.error.code).toBe('ENTITLEMENT_EXCEEDED');

    // 4. Create Draft via HTTP
    const draftConfig = {
      persona: {
        role: 'Vendedor',
        companyName: 'Corp',
        objective: 'Fechar vendas',
        tone: 'FORMAL' as const,
        greetingPhrase: 'Ola',
        closingPhrase: 'Tchau',
        fallbackPhrase: 'Repita',
      },
      voice: { languageCode: 'pt-BR' as const },
      rules: {
        conversational: ['Regra 1'],
        deterministic: { maxDiscountPercent: 5, operatingHours: '09:00-18:00' },
      },
      playbook: { stages: [{ name: 'Intro', goal: 'Apresentar' }] },
      examples: [{ customerInput: 'Oi', idealAgentResponse: 'Ola' }],
    };

    const draftRes = await app.request(`/v1/agents/${agent1.id}/drafts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuration: draftConfig, changelog: 'Initial draft' }),
    });
    expect(draftRes.status).toBe(201);
    const draft = (await draftRes.json()) as AgentVersionMetadataResponse;
    expect(draft.versionNumber).toBe(1);
    expect(draft.status).toBe('DRAFT');

    // 5. Update Draft Configuration via HTTP PATCH
    const updatedConfig = {
      ...draftConfig,
      rules: { ...draftConfig.rules, conversational: ['Regra 1', 'Regra 2'] },
    };
    const patchRes = await app.request(`/v1/agents/${agent1.id}/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuration: updatedConfig, changelog: 'Updated rules' }),
    });
    expect(patchRes.status).toBe(200);

    // 6. Publish Draft via HTTP POST
    const pubRes = await app.request(`/v1/agents/${agent1.id}/drafts/${draft.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pubRes.status).toBe(200);
    const published = (await pubRes.json()) as AgentVersionMetadataResponse;
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedBy).toBe(userId);

    // 7. List Agents metadata: currentPublishedVersionNumber should now be 1
    const listRes = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as AgentMetadataResponse[];
    const foundAgent = list.find((a: AgentMetadataResponse) => a.id === agent1.id);
    expect(foundAgent?.currentPublishedVersionNumber).toBe(1);

    // 8. Configuration endpoint returns snapshot
    const configRes = await app.request(
      `/v1/agents/${agent1.id}/versions/${draft.id}/configuration`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(configRes.status).toBe(200);
    const configData = (await configRes.json()) as AgentVersionConfigurationResponse;
    expect(configData.configuration.rules.conversational).toContain('Regra 2');

    // 9. Archive Agent via HTTP POST
    const archiveRes = await app.request(`/v1/agents/${agent1.id}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(archiveRes.status).toBe(200);
    const archived = (await archiveRes.json()) as AgentMetadataResponse;
    expect(archived.status).toBe('ARCHIVED');

    // 10. Reactivate Agent via HTTP POST (quota freed up and consumed again)
    const reactivateRes = await app.request(`/v1/agents/${agent1.id}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reactivateRes.status).toBe(200);
    const reactivated = (await reactivateRes.json()) as AgentMetadataResponse;
    expect(reactivated.status).toBe('ACTIVE');
  });

  it('Section 40: enforces lifecycle RBAC matrix, published immutability, and cross-tenant isolation', async () => {
    // 1. Setup Org A and Org B
    const orgA = await createOrgWithQuota(5, 'OWNER');
    const orgB = await createOrgWithQuota(5, 'ADMIN');

    // 2. Create users with different roles in Org A
    const roles = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;
    const roleTokens: Record<string, string> = {};
    roleTokens['OWNER'] = await getAssertion(orgA.id, userId);

    for (const role of roles) {
      const roleUserId = `usr_${role.toLowerCase()}_${testSuffix}`;
      await db.insert(user).values({
        id: roleUserId,
        name: `User ${role}`,
        email: `${role.toLowerCase()}_${testSuffix}@example.com`,
      });
      createdUserIds.push(roleUserId);
      await db.insert(organizationMemberships).values({
        organizationId: orgA.id,
        userId: roleUserId,
        role,
        status: 'ACTIVE',
      });
      roleTokens[role] = await getAssertion(orgA.id, roleUserId);
    }

    const tokenB = await getAssertion(orgB.id, userId);

    // 3. Create Agent A in Org A
    const createAgentRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${roleTokens['OWNER']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Agent Lifecycle Test', slug: 'agent-lifecycle-test' }),
    });
    expect(createAgentRes.status).toBe(201);
    const agentA = (await createAgentRes.json()) as AgentMetadataResponse;

    // 4. Create Draft v1 in Agent A
    const draftV1Res = await app.request(`/v1/agents/${agentA.id}/drafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${roleTokens['ADMIN']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        configuration: {
          persona: {
            role: 'Support',
            companyName: 'Acme',
            objective: 'Help users',
            tone: 'FORMAL' as const,
            greetingPhrase: 'Hello',
            closingPhrase: 'Goodbye',
            fallbackPhrase: 'Pardon',
          },
          voice: { languageCode: 'pt-BR' as const },
          rules: { conversational: ['Rule 1'], deterministic: {} },
          playbook: { stages: [] },
          examples: [],
        },
        changelog: 'Draft v1',
      }),
    });
    expect(draftV1Res.status).toBe(201);
    const draftV1 = (await draftV1Res.json()) as AgentVersionMetadataResponse;
    expect(draftV1.versionNumber).toBe(1);

    // 5. Publish RBAC: MANAGER, OPERATOR, VIEWER are blocked (403)
    for (const deniedRole of ['MANAGER', 'OPERATOR', 'VIEWER'] as const) {
      const pubDenied = await app.request(`/v1/agents/${agentA.id}/drafts/${draftV1.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${roleTokens[deniedRole]}` },
      });
      expect(pubDenied.status).toBe(403);
    }

    // 6. Publish with ADMIN succeeds
    const pubAdminRes = await app.request(`/v1/agents/${agentA.id}/drafts/${draftV1.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${roleTokens['ADMIN']}` },
    });
    expect(pubAdminRes.status).toBe(200);
    const publishedV1 = (await pubAdminRes.json()) as AgentVersionMetadataResponse;
    expect(publishedV1.status).toBe('PUBLISHED');

    // 7. Immutability: Mutating a published version is strictly rejected (400 InvalidStateTransitionError)
    const patchPubRes = await app.request(`/v1/agents/${agentA.id}/drafts/${draftV1.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${roleTokens['ADMIN']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ configuration: { persona: { role: 'Hacked' } } }),
    });
    expect(patchPubRes.status).toBe(400);

    const deletePubRes = await app.request(`/v1/agents/${agentA.id}/drafts/${draftV1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${roleTokens['ADMIN']}` },
    });
    expect(deletePubRes.status).toBe(409);

    // 8. Next Draft after publication: server automatically allocates versionNumber 2
    const draftV2Res = await app.request(`/v1/agents/${agentA.id}/drafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${roleTokens['MANAGER']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        configuration: {
          persona: {
            role: 'Support v2',
            companyName: 'Acme',
            objective: 'Help users better',
            tone: 'FORMAL' as const,
            greetingPhrase: 'Hello again',
            closingPhrase: 'Goodbye',
            fallbackPhrase: 'Pardon',
          },
          voice: { languageCode: 'pt-BR' as const },
          rules: { conversational: ['Rule 1', 'Rule 2'], deterministic: {} },
          playbook: { stages: [] },
          examples: [],
        },
        changelog: 'Draft v2',
      }),
    });
    expect(draftV2Res.status).toBe(201);
    const draftV2 = (await draftV2Res.json()) as AgentVersionMetadataResponse;
    expect(draftV2.versionNumber).toBe(2);

    // 9. Publish v2 with OWNER succeeds; previous published version is archived
    const pubOwnerRes = await app.request(`/v1/agents/${agentA.id}/drafts/${draftV2.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${roleTokens['OWNER']}` },
    });
    expect(pubOwnerRes.status).toBe(200);

    // Check version list: v2 is PUBLISHED, v1 is ARCHIVED
    const versionsRes = await app.request(`/v1/agents/${agentA.id}/versions`, {
      headers: { Authorization: `Bearer ${roleTokens['OWNER']}` },
    });
    expect(versionsRes.status).toBe(200);
    const versions = (await versionsRes.json()) as AgentVersionMetadataResponse[];
    const v2Meta = versions.find((v) => v.versionNumber === 2);
    const v1Meta = versions.find((v) => v.versionNumber === 1);
    expect(v2Meta?.status).toBe('PUBLISHED');
    expect(v1Meta?.status).toBe('ARCHIVED');

    // 10. Archive RBAC: MANAGER cannot archive (403), OWNER/ADMIN can
    const archiveManagerRes = await app.request(`/v1/agents/${agentA.id}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${roleTokens['MANAGER']}` },
    });
    expect(archiveManagerRes.status).toBe(403);

    const archiveAdminRes = await app.request(`/v1/agents/${agentA.id}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${roleTokens['ADMIN']}` },
    });
    expect(archiveAdminRes.status).toBe(200);
    const archivedAgent = (await archiveAdminRes.json()) as AgentMetadataResponse;
    expect(archivedAgent.status).toBe('ARCHIVED');

    // 11. Reactivate with OWNER succeeds
    const reactivateOwnerRes = await app.request(`/v1/agents/${agentA.id}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${roleTokens['OWNER']}` },
    });
    expect(reactivateOwnerRes.status).toBe(200);
    const reactivatedAgent = (await reactivateOwnerRes.json()) as AgentMetadataResponse;
    expect(reactivatedAgent.status).toBe('ACTIVE');

    // 12. Cross-tenant isolation: Org B user cannot publish, archive, or reactivate Agent A
    const crossPublishRes = await app.request(
      `/v1/agents/${agentA.id}/drafts/${draftV1.id}/publish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    expect(crossPublishRes.status).toBe(404);

    const crossArchiveRes = await app.request(`/v1/agents/${agentA.id}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossArchiveRes.status).toBe(404);

    const crossReactivateRes = await app.request(`/v1/agents/${agentA.id}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossReactivateRes.status).toBe(404);
  });
});
