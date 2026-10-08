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
import type {
  AgentConfigurationSnapshotV1,
  AgentVersionConfigurationResponse,
} from '@voice-agent/contracts';

describe('HTTP /v1 Agent Draft Toolset Configuration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'toolset-test-key-1';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sub = 'user-toolset-sub-1';

  const validConfig: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa',
      objective: 'Atender clientes',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Não entendi',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja cordial'],
      deterministic: {
        operatingHours: '08:00 - 18:00',
      },
    },
    tools: ['agent.operating_hours'],
  };

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

  const mockDraftVersion: AgentVersion = {
    id: '44444444-4444-4444-4444-444444444444',
    agentId: mockAgent.id,
    organizationId: orgId,
    versionNumber: 2,
    status: 'DRAFT',
    configurationSchemaVersion: 1,
    configuration: validConfig,
    changelog: 'Draft with tools',
    createdBy: sub,
    publishedAt: null,
    publishedBy: null,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };

  let lastCreatedDraftPayload: unknown = null;
  let lastUpdatedDraftPayload: unknown = null;

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
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    } as unknown as MembershipRepository;

    const dummyDeps: ApiDependencies = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {
        getAgentById: async () => mockAgent,
        listAgentsByOrganization: async () => [mockAgent],
        archiveAgent: async () => mockAgent,
      } as unknown as ApiDependencies['agentRepo'],
      versionRepo: {
        getVersionById: async () => mockDraftVersion,
        listVersionsByAgent: async () => [mockDraftVersion],
        getCurrentPublishedVersion: async () => null,
      } as unknown as ApiDependencies['versionRepo'],
      lifecycleService: {
        createAgent: async () => mockAgent,
      } as unknown as ApiDependencies['lifecycleService'],
      draftService: {
        createDraft: async (input: unknown) => {
          lastCreatedDraftPayload = input;
          return mockDraftVersion;
        },
        updateDraftConfiguration: async (input: unknown) => {
          lastUpdatedDraftPayload = input;
          return mockDraftVersion;
        },
      } as unknown as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {
        publishDraft: async () => mockDraftVersion,
      } as unknown as ApiDependencies['publicationService'],
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
    };

    app = createApp(dummyDeps);
  });

  async function makeAuthHeader(): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 25,
      jti: `test-jti-toolset-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);

    return `Bearer ${token}`;
  }

  it('1. POST /v1/agents/{agentId}/drafts accepts a valid canonical toolset', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(`/v1/agents/${mockAgent.id}/drafts`, {
      method: 'POST',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        configuration: validConfig,
        changelog: 'Initial draft with tools',
      }),
    });

    expect(res.status).toBe(201);
    expect(lastCreatedDraftPayload).toMatchObject({
      organizationId: orgId,
      agentId: mockAgent.id,
      configuration: expect.objectContaining({
        tools: ['agent.operating_hours'],
      }),
    });
  });

  it('2. POST /v1/agents/{agentId}/drafts rejects unknown canonical tool identity with 400', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(`/v1/agents/${mockAgent.id}/drafts`, {
      method: 'POST',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        configuration: {
          ...validConfig,
          tools: ['unknown.dormant_tool'],
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it('3. POST /v1/agents/{agentId}/drafts rejects duplicate canonical tool identities with 400', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(`/v1/agents/${mockAgent.id}/drafts`, {
      method: 'POST',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        configuration: {
          ...validConfig,
          tools: ['agent.operating_hours', 'agent.operating_hours'],
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it('4. PATCH /v1/agents/{agentId}/drafts/{versionId} updates draft toolset successfully', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(`/v1/agents/${mockAgent.id}/drafts/${mockDraftVersion.id}`, {
      method: 'PATCH',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        configuration: validConfig,
      }),
    });

    expect(res.status).toBe(200);
    expect(lastUpdatedDraftPayload).toMatchObject({
      organizationId: orgId,
      agentId: mockAgent.id,
      versionId: mockDraftVersion.id,
      configuration: expect.objectContaining({
        tools: ['agent.operating_hours'],
      }),
    });
  });

  it('5. PATCH strictly rejects attempts to inject or override trusted IDs', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(`/v1/agents/${mockAgent.id}/drafts/${mockDraftVersion.id}`, {
      method: 'PATCH',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        configuration: validConfig,
        organizationId: 'forged-org-id',
        createdBy: 'attacker-sub',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('6. GET /v1/agents/{agentId}/versions/{versionId}/configuration returns configured toolset', async () => {
    const auth = await makeAuthHeader();
    const res = await app.request(
      `/v1/agents/${mockAgent.id}/versions/${mockDraftVersion.id}/configuration`,
      {
        method: 'GET',
        headers: { authorization: auth },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as AgentVersionConfigurationResponse;
    expect(body.configuration.tools).toEqual(['agent.operating_hours']);
  });
});
