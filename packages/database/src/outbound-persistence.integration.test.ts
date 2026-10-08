import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';
import { outboundCampaigns, outboundCallJobs } from './schema/outbound.js';
import { user } from './schema/auth.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Outbound Persistence & Tenant Isolation (007E Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const outboundRepo = new DrizzleOutboundRepository(db);

  const runId = Math.random().toString(36).substring(2, 8);
  const userId = `usr-test-${runId}`;
  let orgAId = '';
  let orgBId = '';
  let agentAId = '';
  let publishedVersionAId = '';
  let draftVersionAId = '';
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    await db.insert(user).values({
      id: userId,
      name: `Outbound Tester ${runId}`,
      email: `tester-${runId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const orgA = await orgRepo.createOrganization({
      slug: `outbound-org-a-${runId}`,
      name: `Outbound Org A ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `outbound-org-b-${runId}`,
      name: `Outbound Org B ${runId}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) throw new Error('Failed to create test organizations');

    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgAId, orgBId);

    const [agentA] = await db
      .insert(agents)
      .values({
        organizationId: orgAId,
        name: `Outbound Agent ${runId}`,
        slug: `agent-${runId}`,
        status: 'ACTIVE',
      })
      .returning();
    if (!agentA) throw new Error('Failed to create agent');
    agentAId = agentA.id;

    const [draftVer] = await db
      .insert(agentVersions)
      .values({
        organizationId: orgAId,
        agentId: agentAId,
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { prompt: 'Outbound sales agent', tools: [] },
        createdBy: userId,
      })
      .returning();
    if (!draftVer) throw new Error('Failed to create draft version');
    draftVersionAId = draftVer.id;

    const [publishedVer] = await db
      .insert(agentVersions)
      .values({
        organizationId: orgAId,
        agentId: agentAId,
        versionNumber: 2,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: { prompt: 'Outbound sales agent v2', tools: [] },
        createdBy: userId,
        publishedAt: new Date(),
        publishedBy: userId,
      })
      .returning();
    if (!publishedVer) throw new Error('Failed to create published version');
    publishedVersionAId = publishedVer.id;
  });

  afterAll(async () => {
    try {
      if (createdOrgIds.length > 0) {
        await db
          .delete(outboundCallJobs)
          .where(inArray(outboundCallJobs.organizationId, createdOrgIds));
        await db
          .delete(outboundCampaigns)
          .where(inArray(outboundCampaigns.organizationId, createdOrgIds));
        await db.delete(agentVersions).where(inArray(agentVersions.organizationId, createdOrgIds));
        await db.delete(agents).where(inArray(agents.organizationId, createdOrgIds));
        await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
      }
      await db.delete(user).where(inArray(user.id, [userId]));
    } finally {
      await pool.end();
    }
  });

  it('creates and persists campaign bound to published agent version', async () => {
    const campaign = await outboundRepo.createCampaign({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      name: `Campaign ${runId}`,
      status: 'ACTIVE',
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.organizationId).toBe(orgAId);
    expect(campaign.agentVersionId).toBe(publishedVersionAId);

    const fetched = await outboundRepo.getCampaignById(orgAId, campaign.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe(`Campaign ${runId}`);
  });

  it('rejects campaign creation if agent version is not PUBLISHED', async () => {
    await expect(
      outboundRepo.createCampaign({
        organizationId: orgAId,
        agentId: agentAId,
        agentVersionId: draftVersionAId,
        name: 'Invalid Campaign',
      }),
    ).rejects.toThrow(/must be PUBLISHED/);
  });

  it('creates and claims due outbound job atomically', async () => {
    const job = await outboundRepo.createJob({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      destinationPhone: '+5511999991111',
      idempotencyKey: `job-1-${runId}`,
      scheduledAt: new Date(Date.now() - 1000),
    });

    expect(job.status).toBe('SCHEDULED');
    expect(job.attempts).toBe(0);

    const claimed = await outboundRepo.claimNextDueJob({
      organizationId: orgAId,
      workerId: 'worker-1',
    });
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe('CLAIMED');
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.claimedBy).toBe('worker-1');
  });

  it('prevents concurrent double claims of the same job', async () => {
    const job = await outboundRepo.createJob({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      destinationPhone: '+5511999992222',
      idempotencyKey: `job-2-${runId}`,
      scheduledAt: new Date(Date.now() - 1000),
    });

    const firstClaim = await outboundRepo.claimJob({
      organizationId: orgAId,
      jobId: job.id,
      workerId: 'worker-A',
    });
    expect(firstClaim).not.toBeNull();
    expect(firstClaim?.status).toBe('CLAIMED');

    const secondClaim = await outboundRepo.claimJob({
      organizationId: orgAId,
      jobId: job.id,
      workerId: 'worker-B',
    });
    expect(secondClaim).toBeNull();
  });

  it('does not claim future scheduled jobs', async () => {
    const futureJob = await outboundRepo.createJob({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      destinationPhone: '+5511999993333',
      idempotencyKey: `job-future-${runId}`,
      scheduledAt: new Date(Date.now() + 60_000),
    });

    const claimed = await outboundRepo.claimJob({
      organizationId: orgAId,
      jobId: futureJob.id,
      workerId: 'worker-1',
    });
    expect(claimed).toBeNull();
  });

  it('enforces tenant isolation across reads and claims', async () => {
    const job = await outboundRepo.createJob({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      destinationPhone: '+5511999994444',
      idempotencyKey: `job-tenant-${runId}`,
      scheduledAt: new Date(Date.now() - 1000),
    });

    const crossRead = await outboundRepo.getJobById(orgBId, job.id);
    expect(crossRead).toBeNull();

    const crossClaim = await outboundRepo.claimJob({
      organizationId: orgBId,
      jobId: job.id,
      workerId: 'worker-cross',
    });
    expect(crossClaim).toBeNull();

    const crossNext = await outboundRepo.claimNextDueJob({
      organizationId: orgBId,
      workerId: 'worker-cross',
    });
    expect(crossNext).toBeNull();
  });

  it('updates job outcomes and enforces valid state transitions', async () => {
    const job = await outboundRepo.createJob({
      organizationId: orgAId,
      agentId: agentAId,
      agentVersionId: publishedVersionAId,
      destinationPhone: '+5511999995555',
      idempotencyKey: `job-outcome-${runId}`,
      scheduledAt: new Date(Date.now() - 1000),
    });

    const claimed = await outboundRepo.claimJob({
      organizationId: orgAId,
      jobId: job.id,
      workerId: 'worker-1',
    });
    expect(claimed?.status).toBe('CLAIMED');

    const dispatched = await outboundRepo.updateJobOutcome({
      organizationId: orgAId,
      jobId: job.id,
      status: 'DISPATCHED',
      callId: '44444444-4444-4444-8444-444444444444',
    });
    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.callId).toBe('44444444-4444-4444-8444-444444444444');

    await expect(
      outboundRepo.updateJobOutcome({
        organizationId: orgAId,
        jobId: job.id,
        status: 'CLAIMED',
      }),
    ).rejects.toThrow(/Invalid outbound job status transition/);
  });
});
