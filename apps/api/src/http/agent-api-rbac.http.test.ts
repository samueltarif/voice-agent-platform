import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type {
  OrganizationRepository,
  MembershipRepository,
  Agent,
  AgentVersion,
} from '@voice-agent/database';
import type { TenantRole, AgentVersionConfigurationResponse } from '@voice-agent/contracts';

describe('HTTP /v1 RBAC Matrix & Confidentiality Regression Tests', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'rbac-test-key-1';
  const orgId = '22222222-2222-2222-2222-222222222222';
  const sub = 'user-rbac-sub-1';
  let currentRole: TenantRole = 'VIEWER';

  const mockAgent: Agent = {
    id: '33333333-3333-3333-3333-333333333333',
    organizationId: orgId,
    name: 'Sales Agent',
    slug: 'sales-agent',
    status: 'ACTIVE',
    nextVersionNumber: 2,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };

  const mockVersion: AgentVersion = {
    id: '44444444-4444-4444-4444-444444444444',
    agentId: mockAgent.id,
    organizationId: orgId,
    versionNumber: 1,
    status: 'PUBLISHED',
    configurationSchemaVersion: 1,
    configuration: {
      persona: { name: 'VIP Secret Persona', role: 'Closer', objective: 'Close high-ticket sales' },
      language: { defaultLocale: 'pt-BR', supportedLocales: ['pt-BR'] },
      rules: {
        generalInstructions: 'Do not leak secret playbook',
        operationalBoundaries: [],
        forbiddenBehaviors: [],
      },
      playbook: { conversationFlows: ['pitch', 'close'] },
      examples: [{ input: 'Hi', output: 'Hello VIP' }],
    },
    changelog: 'Super secret changelog for version 1',
    createdBy: sub,
    publishedAt: new Date('2026-09-01T12:00:00Z'),
    publishedBy: sub,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    const mockOrgRepo = {
      findOrganizationById: async () => ({ id: orgId, status: 'ACTIVE' }),
    } as unknown as OrganizationRepository;

    const mockMembershipRepo = {
      findMembership: async () => ({
        organizationId: orgId,
        userId: sub,
        role: currentRole,
        status: 'ACTIVE',
      }),
    } as unknown as MembershipRepository;

    const dummyDeps = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {
        listAgentsByOrganization: async () => [mockAgent],
        getAgentById: async () => mockAgent,
        archiveAgent: async () => ({ ...mockAgent, status: 'ARCHIVED' as const }),
      } as unknown as ApiDependencies['agentRepo'],
      versionRepo: {
        getCurrentPublishedVersion: async () => mockVersion,
        listVersionsByAgent: async () => [mockVersion],
        getVersionById: async () => mockVersion,
      } as unknown as ApiDependencies['versionRepo'],
      lifecycleService: {
        createAgent: async () => mockAgent,
      } as unknown as ApiDependencies['lifecycleService'],
      draftService: {
        createDraft: async () => mockVersion,
        updateDraftConfiguration: async () => mockVersion,
      } as unknown as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {
        publishDraft: async () => mockVersion,
      } as unknown as ApiDependencies['publicationService'],
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
    };

    app = createApp(dummyDeps);
  });

  async function getAssertion(): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 30,
      jti: 'jti-rbac',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  function assertConfidentiality(jsonString: string) {
    const forbiddenKeys = [
      'configuration',
      'persona',
      'rules',
      'playbook',
      'examples',
      'changelog',
      'nextVersionNumber',
    ];
    for (const forbidden of forbiddenKeys) {
      expect(jsonString).not.toContain(`"${forbidden}"`);
    }
  }

  it('VIEWER role has access to metadata, but forbidden from config, creation and publish', async () => {
    currentRole = 'VIEWER';
    const token = await getAssertion();

    // Allowed: metadata
    const listRes = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.status).toBe(200);
    assertConfidentiality(JSON.stringify(await listRes.json()));

    const getRes = await app.request(`/v1/agents/${mockAgent.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
    assertConfidentiality(JSON.stringify(await getRes.json()));

    const versionsRes = await app.request(`/v1/agents/${mockAgent.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(versionsRes.status).toBe(200);
    assertConfidentiality(JSON.stringify(await versionsRes.json()));

    // Forbidden: config
    const configRes = await app.request(
      `/v1/agents/${mockAgent.id}/versions/${mockVersion.id}/configuration`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(configRes.status).toBe(403);

    // Forbidden: mutate
    const createRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Agent', slug: 'new-agent' }),
    });
    expect(createRes.status).toBe(403);
  });

  it('OPERATOR role has access to metadata, but forbidden from configuration', async () => {
    currentRole = 'OPERATOR';
    const token = await getAssertion();

    const versionsRes = await app.request(`/v1/agents/${mockAgent.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(versionsRes.status).toBe(200);
    assertConfidentiality(JSON.stringify(await versionsRes.json()));

    const configRes = await app.request(
      `/v1/agents/${mockAgent.id}/versions/${mockVersion.id}/configuration`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(configRes.status).toBe(403);
  });

  it('MANAGER role has access to configuration and draft edit, but forbidden from publish', async () => {
    currentRole = 'MANAGER';
    const token = await getAssertion();

    // Allowed: configuration
    const configRes = await app.request(
      `/v1/agents/${mockAgent.id}/versions/${mockVersion.id}/configuration`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(configRes.status).toBe(200);
    const configBody = (await configRes.json()) as AgentVersionConfigurationResponse;
    expect(configBody.configuration).toBeDefined();

    // Forbidden: publish
    const publishRes = await app.request(
      `/v1/agents/${mockAgent.id}/drafts/${mockVersion.id}/publish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(publishRes.status).toBe(403);
  });

  it('ADMIN and OWNER roles can create, edit, archive and publish', async () => {
    for (const role of ['ADMIN', 'OWNER'] as const) {
      currentRole = role;
      const token = await getAssertion();

      const createRes = await app.request('/v1/agents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Admin Agent', slug: `admin-agent-${role.toLowerCase()}` }),
      });
      expect(createRes.status).toBe(201);

      const archiveRes = await app.request(`/v1/agents/${mockAgent.id}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(archiveRes.status).toBe(200);

      const publishRes = await app.request(
        `/v1/agents/${mockAgent.id}/drafts/${mockVersion.id}/publish`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(publishRes.status).toBe(200);
    }
  });
});
