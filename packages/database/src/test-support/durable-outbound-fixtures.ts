import { randomUUID } from 'node:crypto';
import type { DatabaseInstance } from '../client/connection.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { DrizzleOutboundRepository } from '../repositories/outbound-repository.js';
import { agents, agentVersions } from '../schema/agents.js';
import { user } from '../schema/auth.js';

export interface TenantFixture {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly campaignId: string;
  readonly jobId: string;
}

export interface DurableOutboundFixture {
  readonly runId: string;
  readonly userId: string;
  readonly tenantA: TenantFixture;
  readonly tenantB: TenantFixture;
}

async function createPublishedAgent(db: DatabaseInstance, orgId: string, userId: string) {
  const [agent] = await db
    .insert(agents)
    .values({
      organizationId: orgId,
      name: 'OF2 Agent',
      slug: `of2-${randomUUID()}`,
      status: 'ACTIVE',
    })
    .returning();
  const [version] = await db
    .insert(agentVersions)
    .values({
      organizationId: orgId,
      agentId: agent!.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      configurationSchemaVersion: 1,
      configuration: { prompt: 'synthetic', tools: [] },
      createdBy: userId,
      publishedAt: new Date(),
      publishedBy: userId,
    })
    .returning();
  return { agentId: agent!.id, agentVersionId: version!.id };
}

export async function createTenant(
  db: DatabaseInstance,
  input: { readonly runId: string; readonly userId: string; readonly tag: string },
) {
  const { runId, userId, tag } = input;
  const org = await new OrganizationRepository(db).createOrganization({
    slug: `of2-${tag}-${runId}`,
    name: `OF2 ${tag} ${runId}`,
    status: 'ACTIVE',
  });
  if (!org) throw new Error('Failed to create organization fixture.');
  const agent = await createPublishedAgent(db, org.id, userId);
  const outbound = new DrizzleOutboundRepository(db);
  const campaign = await outbound.createCampaign({
    organizationId: org.id,
    ...agent,
    name: `Campaign ${tag}`,
    status: 'ACTIVE',
  });
  const job = await outbound.createJob({
    organizationId: org.id,
    campaignId: campaign.id,
    ...agent,
    destinationPhone: '+15555550100',
    idempotencyKey: `job-${tag}-${runId}`,
    maxAttempts: 3,
  });
  return { organizationId: org.id, ...agent, campaignId: campaign.id, jobId: job.id };
}

export async function createDurableOutboundFixture(
  db: DatabaseInstance,
): Promise<DurableOutboundFixture> {
  const runId = randomUUID().slice(0, 8);
  const userId = `usr-of2-${runId}`;
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: `OF2 ${runId}`,
    email: `of2-${runId}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const tenantA = await createTenant(db, { runId, userId, tag: 'a' });
  const tenantB = await createTenant(db, { runId, userId, tag: 'b' });
  return { runId, userId, tenantA, tenantB };
}

/**
 * Fixtures sintéticas criadas DENTRO de um banco descartável por suíte
 * (`disposable-test-database.ts`); o descarte é o DROP do banco inteiro, sem
 * DELETEs na trilha de auditoria.
 */

/** Job adicional do tenant (cada cenário de crash usa um job próprio). */
export async function createExtraJob(
  db: DatabaseInstance,
  input: {
    readonly tenant: TenantFixture;
    readonly tag: string;
    readonly destinationPhone?: string;
  },
): Promise<string> {
  const job = await new DrizzleOutboundRepository(db).createJob({
    organizationId: input.tenant.organizationId,
    campaignId: input.tenant.campaignId,
    agentId: input.tenant.agentId,
    agentVersionId: input.tenant.agentVersionId,
    destinationPhone: input.destinationPhone ?? '+15555550100',
    idempotencyKey: `job-${input.tag}-${randomUUID()}`,
    maxAttempts: 3,
  });
  return job.id;
}
