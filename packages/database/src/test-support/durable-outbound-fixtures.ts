import { randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { OrganizationRepository } from '../repositories/organization-repository.js';
import { DrizzleOutboundRepository } from '../repositories/outbound-repository.js';
import { agents, agentVersions } from '../schema/agents.js';
import { user } from '../schema/auth.js';
import { organizations } from '../schema/organizations.js';
import { outboundCallJobs, outboundCampaigns } from '../schema/outbound.js';

/** Banco local descartável: 'localhost'/'127.0.0.1'/'::1' apenas (fail-closed). */
export const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertLocalDatabaseUrl(connectionString: string): void {
  const host = new URL(connectionString).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('Refusing to run durable outbound tests against a non-local database.');
  }
}

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

async function createTenant(
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

/** Teardown escopado ao runId; sessão↔tentativa removidas no MESMO statement. */
export async function destroyDurableOutboundFixture(
  db: DatabaseInstance,
  fixture: DurableOutboundFixture,
): Promise<void> {
  const orgIds = [fixture.tenantA.organizationId, fixture.tenantB.organizationId];
  await db.execute(sql`
    WITH removed_sessions AS (
      DELETE FROM call_sessions WHERE organization_id IN (${sql.join(orgIds, sql`, `)})
    )
    DELETE FROM call_attempts WHERE organization_id IN (${sql.join(orgIds, sql`, `)})
  `);
  await db.execute(
    sql`DELETE FROM organization_phone_numbers WHERE organization_id IN (${sql.join(orgIds, sql`, `)})`,
  );
  await db.delete(outboundCallJobs).where(inArray(outboundCallJobs.organizationId, orgIds));
  await db.delete(outboundCampaigns).where(inArray(outboundCampaigns.organizationId, orgIds));
  await db.delete(agentVersions).where(inArray(agentVersions.organizationId, orgIds));
  await db.delete(agents).where(inArray(agents.organizationId, orgIds));
  await db.delete(organizations).where(inArray(organizations.id, orgIds));
  await db.delete(user).where(inArray(user.id, [fixture.userId]));
}

/** Prova de zero resíduos após o teardown. */
export async function countDurableOutboundLeftovers(
  db: DatabaseInstance,
  fixture: DurableOutboundFixture,
): Promise<number> {
  const orgIds = [fixture.tenantA.organizationId, fixture.tenantB.organizationId];
  const result = await db.execute<{ total: string }>(sql`
    SELECT (
      (SELECT count(*) FROM call_events WHERE organization_id IN (${sql.join(orgIds, sql`, `)})) +
      (SELECT count(*) FROM call_attempts WHERE organization_id IN (${sql.join(orgIds, sql`, `)})) +
      (SELECT count(*) FROM call_sessions WHERE organization_id IN (${sql.join(orgIds, sql`, `)})) +
      (SELECT count(*) FROM organizations WHERE id IN (${sql.join(orgIds, sql`, `)}))
    )::text AS total
  `);
  return Number(result.rows[0]?.total ?? '0');
}

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
