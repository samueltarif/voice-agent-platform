import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
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

  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'integration-key-1';
  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userId = `usr_int_life_${testSuffix}`;

  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    app = createApp({
      logger: createNullLogger(),
      verifier,
      agentRepo,
      versionRepo,
      lifecycleService,
      draftService,
      discardService,
      publicationService,
      membershipRepo,
      organizationRepo,
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
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
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
});
