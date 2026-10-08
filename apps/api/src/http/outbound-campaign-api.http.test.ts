import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
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
import {
  OUTBOUND_BATCH_MAX_SIZE,
  type TenantRole,
  type OutboundCampaign,
  type OutboundCallJob,
  type OutboundRepositoryPort,
  type CreateOutboundCampaignInput,
  type ListOutboundCampaignsInput,
  type ScheduleBatchJobsInput,
  type CreateOutboundJobInput,
  type ClaimJobInput,
  type ClaimNextDueJobInput,
  type UpdateJobOutcomeInput,
} from '@voice-agent/contracts';
import { BadRequestError, NotFoundError, ConflictError } from '@voice-agent/errors';

describe('HTTP /v1 Outbound Campaign & Batch Scheduling API (007F)', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'outbound-test-key-1';
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';
  const sub = 'user-outbound-tester';
  let currentRole: TenantRole = 'MANAGER';
  let currentOrgId: string = orgA;

  const validAgentId = '33333333-3333-4333-8333-333333333333';
  const publishedVersionId = '44444444-4444-4444-8444-444444444444';
  const draftVersionId = '55555555-5555-4555-8555-555555555555';

  const mockAgent: Agent = {
    id: validAgentId,
    organizationId: orgA,
    name: 'Sales Agent',
    slug: 'sales-agent',
    status: 'ACTIVE',
    nextVersionNumber: 2,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };

  const mockPublishedVersion: AgentVersion = {
    id: publishedVersionId,
    agentId: validAgentId,
    organizationId: orgA,
    versionNumber: 1,
    status: 'PUBLISHED',
    configurationSchemaVersion: 1,
    configuration: { prompt: 'Outbound agent' },
    changelog: 'v1',
    createdBy: sub,
    publishedAt: new Date('2026-09-01T12:00:00Z'),
    publishedBy: sub,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };

  class TestOutboundRepository implements OutboundRepositoryPort {
    public campaigns = new Map<string, OutboundCampaign>();
    public jobs = new Map<string, OutboundCallJob>();

    async createCampaign(input: CreateOutboundCampaignInput): Promise<OutboundCampaign> {
      if (input.agentVersionId === draftVersionId) {
        throw new BadRequestError('Cannot create campaign: agent version must be PUBLISHED.');
      }
      const campaign: OutboundCampaign = {
        id: randomUUID(),
        organizationId: input.organizationId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        name: input.name,
        description: input.description,
        status: input.status ?? 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.campaigns.set(campaign.id, campaign);
      return campaign;
    }

    async getCampaignById(
      organizationId: string,
      campaignId: string,
    ): Promise<OutboundCampaign | null> {
      const camp = this.campaigns.get(campaignId);
      if (!camp || camp.organizationId !== organizationId) return null;
      return camp;
    }

    async listCampaigns(input: ListOutboundCampaignsInput): Promise<OutboundCampaign[]> {
      const clampedLimit = Math.min(Math.max(1, input.limit ?? 20), 100);
      const offset = Math.max(0, input.offset ?? 0);
      const list = Array.from(this.campaigns.values())
        .filter((c) => c.organizationId === input.organizationId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.slice(offset, offset + clampedLimit);
    }

    async createJob(input: CreateOutboundJobInput): Promise<OutboundCallJob> {
      const job: OutboundCallJob = {
        id: randomUUID(),
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        destinationPhone: input.destinationPhone,
        recipientName: input.recipientName,
        status: 'SCHEDULED',
        scheduledAt: input.scheduledAt ?? new Date(),
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.jobs.set(job.id, job);
      return job;
    }

    async getJobById(organizationId: string, jobId: string): Promise<OutboundCallJob | null> {
      const job = this.jobs.get(jobId);
      if (!job || job.organizationId !== organizationId) return null;
      return job;
    }

    async getJobByIdempotencyKey(
      organizationId: string,
      idempotencyKey: string,
    ): Promise<OutboundCallJob | null> {
      for (const job of this.jobs.values()) {
        if (job.organizationId === organizationId && job.idempotencyKey === idempotencyKey) {
          return job;
        }
      }
      return null;
    }

    async scheduleBatchJobs(input: ScheduleBatchJobsInput): Promise<OutboundCallJob[]> {
      if (!input.items || input.items.length === 0) {
        throw new BadRequestError('Batch cannot be empty.');
      }
      if (input.items.length > OUTBOUND_BATCH_MAX_SIZE) {
        throw new BadRequestError(
          `Batch size exceeds maximum allowed of ${OUTBOUND_BATCH_MAX_SIZE} items.`,
        );
      }

      const campaign = await this.getCampaignById(input.organizationId, input.campaignId);
      if (!campaign) {
        throw new NotFoundError(
          `Campaign '${input.campaignId}' not found for tenant '${input.organizationId}'.`,
        );
      }

      const seenKeys = new Set<string>();
      const prepared = input.items.map((item, idx) => {
        if (!item.destinationPhone || item.destinationPhone.trim().length === 0) {
          throw new BadRequestError(`Item at index ${idx} must have a valid destination phone.`);
        }
        const key =
          item.idempotencyKey ??
          (input.batchIdempotencyKey ? `${input.batchIdempotencyKey}:${idx}` : undefined);
        if (!key || key.trim().length === 0) {
          throw new BadRequestError(
            `Item at index ${idx} must have an idempotencyKey or batchIdempotencyKey must be provided.`,
          );
        }
        const trimmed = key.trim();
        if (seenKeys.has(trimmed)) {
          throw new BadRequestError(`Duplicate idempotency key '${trimmed}' within batch.`);
        }
        seenKeys.add(trimmed);
        return { ...item, effectiveKey: trimmed };
      });

      const existingJobs: OutboundCallJob[] = [];
      for (const item of prepared) {
        const found = await this.getJobByIdempotencyKey(input.organizationId, item.effectiveKey);
        if (found) existingJobs.push(found);
      }

      if (existingJobs.length === prepared.length) {
        return existingJobs;
      }
      if (existingJobs.length > 0) {
        throw new ConflictError(
          `Idempotency conflict: ${existingJobs.length} of ${prepared.length} jobs already exist with conflicting keys.`,
        );
      }

      const created: OutboundCallJob[] = [];
      for (const item of prepared) {
        const job = await this.createJob({
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          agentId: campaign.agentId,
          agentVersionId: campaign.agentVersionId,
          destinationPhone: item.destinationPhone.trim(),
          recipientName: item.recipientName?.trim(),
          scheduledAt: item.scheduledAt ?? new Date(),
          maxAttempts: item.maxAttempts ?? 3,
          idempotencyKey: item.effectiveKey,
        });
        created.push(job);
      }
      return created;
    }

    async claimNextDueJob(_input: ClaimNextDueJobInput): Promise<OutboundCallJob | null> {
      return null;
    }
    async claimJob(_input: ClaimJobInput): Promise<OutboundCallJob | null> {
      return null;
    }
    async updateJobOutcome(_input: UpdateJobOutcomeInput): Promise<OutboundCallJob> {
      throw new Error('Not implemented');
    }
  }

  let outboundRepo: TestOutboundRepository;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    const mockOrgRepo = {
      findOrganizationById: async (opts: { id: string }) => ({ id: opts.id, status: 'ACTIVE' }),
    } as unknown as OrganizationRepository;

    const mockMembershipRepo = {
      findMembership: async (opts: { organizationId: string; userId: string }) => ({
        organizationId: opts.organizationId,
        userId: opts.userId,
        role: currentRole,
        status: 'ACTIVE',
      }),
    } as unknown as MembershipRepository;

    outboundRepo = new TestOutboundRepository();

    const dummyDeps: ApiDependencies = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {
        listAgentsByOrganization: async () => [mockAgent],
        getAgentById: async () => mockAgent,
      } as unknown as ApiDependencies['agentRepo'],
      versionRepo: {
        getCurrentPublishedVersion: async () => mockPublishedVersion,
      } as unknown as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
      outboundRepo,
    };

    app = createApp(dummyDeps);
  });

  async function getAssertion(orgId = currentOrgId): Promise<string> {
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
      jti: `jti-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('creates campaign with trusted organization context and server-generated ID', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const res = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: validAgentId,
        agentVersionId: publishedVersionId,
        name: 'Fall Outreach 2026',
        description: 'Targeted survey',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; organizationId: string; name: string };
    expect(body.id).toBeDefined();
    expect(body.organizationId).toBe(orgA);
    expect(body.name).toBe('Fall Outreach 2026');
  });

  it('rejects client attempting to override organizationId in body fail-closed', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const res = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgB, // Spoofing attempt
        agentId: validAgentId,
        agentVersionId: publishedVersionId,
        name: 'Spoofed Campaign',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces RBAC mutation boundaries: VIEWER and OPERATOR are forbidden', async () => {
    for (const role of ['VIEWER', 'OPERATOR'] as const) {
      currentRole = role;
      currentOrgId = orgA;
      const token = await getAssertion();

      const createRes = await app.request('/v1/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: validAgentId,
          agentVersionId: publishedVersionId,
          name: 'Forbidden Campaign',
        }),
      });
      expect(createRes.status).toBe(403);
    }
  });

  it('allows authorized roles (MANAGER, ADMIN, OWNER) to create campaigns', async () => {
    for (const role of ['MANAGER', 'ADMIN', 'OWNER'] as const) {
      currentRole = role;
      currentOrgId = orgA;
      const token = await getAssertion();

      const createRes = await app.request('/v1/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: validAgentId,
          agentVersionId: publishedVersionId,
          name: `Campaign by ${role}`,
        }),
      });
      expect(createRes.status).toBe(201);
    }
  });

  it('rejects campaign creation when agent version is not PUBLISHED', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const res = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: validAgentId,
        agentVersionId: draftVersionId,
        name: 'Unpublished Version Campaign',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('retrieves campaign by ID and fails closed on unknown or cross-tenant reads', async () => {
    currentRole = 'VIEWER';
    currentOrgId = orgA;
    const tokenA = await getAssertion(orgA);

    // Create campaign in orgA
    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Readable Campaign',
    });

    // 1. Same tenant VIEWER can read
    const resA = await app.request(`/v1/campaigns/${camp.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(resA.status).toBe(200);

    // 2. Unknown ID returns 404
    const resUnknown = await app.request(`/v1/campaigns/99999999-9999-4999-8999-999999999999`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(resUnknown.status).toBe(404);

    // 3. Cross-tenant read from orgB returns 404
    const tokenB = await getAssertion(orgB);
    const resB = await app.request(`/v1/campaigns/${camp.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(resB.status).toBe(404);
  });

  it('enforces bounded list pagination and cross-tenant isolation', async () => {
    currentRole = 'VIEWER';
    currentOrgId = orgA;
    const tokenA = await getAssertion(orgA);

    const resList = await app.request('/v1/campaigns?limit=5&offset=0', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(resList.status).toBe(200);
    const list = (await resList.json()) as Array<{ organizationId: string }>;
    for (const c of list) {
      expect(c.organizationId).toBe(orgA);
    }

    // Tenant B sees only its own
    const tokenB = await getAssertion(orgB);
    const resListB = await app.request('/v1/campaigns', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(resListB.status).toBe(200);
    const listB = (await resListB.json()) as Array<{ organizationId: string }>;
    for (const c of listB) {
      expect(c.organizationId).toBe(orgB);
    }
  });

  it('schedules batch jobs with due-now and future timestamps', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Batch Dispatch Campaign',
    });

    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const res = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchIdempotencyKey: 'api-batch-1',
        items: [
          { destinationPhone: '+5511999990001', recipientName: 'Lead Immediate' },
          {
            destinationPhone: '+5511999990002',
            recipientName: 'Lead Future',
            scheduledAt: futureIso,
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      count: number;
      jobs: Array<{
        status: string;
        destinationPhone: string;
        agentId: string;
        agentVersionId: string;
      }>;
    };
    expect(body.count).toBe(2);
    expect(body.jobs[0]?.status).toBe('SCHEDULED');
    expect(body.jobs[0]?.agentId).toBe(validAgentId);
    expect(body.jobs[0]?.agentVersionId).toBe(publishedVersionId);
    expect(body.jobs[1]?.status).toBe('SCHEDULED');
  });

  it('rejects batch exceeding static engineering bound or empty batch', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Bound Campaign',
    });

    // Empty batch -> 400
    const resEmpty = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    expect(resEmpty.status).toBe(400);

    // Over 100 items -> 400
    const over100 = Array.from({ length: 101 }, (_, i) => ({
      destinationPhone: `+551199999${String(i).padStart(4, '0')}`,
    }));
    const resOver = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: over100 }),
    });
    expect(resOver.status).toBe(400);
  });

  it('rejects malformed destination phone and malformed scheduledAt', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Malformed Input Campaign',
    });

    // Empty destination phone
    const resBadPhone = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ destinationPhone: '' }],
      }),
    });
    expect(resBadPhone.status).toBe(400);

    // Malformed scheduledAt timestamp
    const resBadDate = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ destinationPhone: '+5511999990001', scheduledAt: 'not-a-valid-date' }],
      }),
    });
    expect(resBadDate.status).toBe(400);
  });

  it('supports idempotent replay without creating duplicate jobs', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Idempotent Replay Campaign',
    });

    const payload = {
      batchIdempotencyKey: 'idem-replay-key-1',
      items: [
        { destinationPhone: '+5511999991111', recipientName: 'Lead 1' },
        { destinationPhone: '+5511999992222', recipientName: 'Lead 2' },
      ],
    };

    // First call -> 201
    const res1 = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as { jobs: Array<{ id: string }> };

    // Idempotent retry -> 201 with identical job IDs
    const res2 = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as { jobs: Array<{ id: string }> };

    expect(body2.jobs[0]?.id).toBe(body1.jobs[0]?.id);
    expect(body2.jobs[1]?.id).toBe(body1.jobs[1]?.id);

    // Total jobs in repo for this campaign must still be exactly 2
    const allJobs = Array.from(outboundRepo.jobs.values()).filter((j) => j.campaignId === camp.id);
    expect(allJobs).toHaveLength(2);
  });

  it('rejects batch with duplicate keys within the same request', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const camp = await outboundRepo.createCampaign({
      organizationId: orgA,
      agentId: validAgentId,
      agentVersionId: publishedVersionId,
      name: 'Duplicate Keys Campaign',
    });

    const res = await app.request(`/v1/campaigns/${camp.id}/batch-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { destinationPhone: '+5511999993333', idempotencyKey: 'same-key' },
          { destinationPhone: '+5511999994444', idempotencyKey: 'same-key' },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });

  it('sanitizes error responses without exposing internal SQL or stack traces', async () => {
    currentRole = 'MANAGER';
    currentOrgId = orgA;
    const token = await getAssertion();

    const res = await app.request('/v1/campaigns/not-a-valid-uuid', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toBeDefined();
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(JSON.stringify(body)).not.toContain('stack');
  });
});
