import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { user } from './schema/auth.js';
import { organizations } from './schema/organizations.js';
import { agents, agentVersions } from './schema/agents.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Agent Referential Integrity and Tenant Protection (Postgres Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userId = `usr_ref_test_${testSuffix}`;
  let orgId: string;
  let agentId: string;
  let versionId: string;

  beforeAll(async () => {
    await db
      .insert(user)
      .values([{ id: userId, name: 'Ref Tester', email: `ref_test_${testSuffix}@example.com` }]);

    const org = await orgRepo.createOrganization({
      slug: `org-ref-${testSuffix}`,
      name: `Org Ref ${testSuffix}`,
      status: 'ACTIVE',
    });
    if (!org) {
      throw new Error('Test setup failed: org');
    }
    orgId = org.id;

    const [createdAgent] = await db
      .insert(agents)
      .values({
        organizationId: orgId,
        name: 'Agent Protected',
        slug: 'protected-agent',
        status: 'ACTIVE',
      })
      .returning();
    if (!createdAgent) {
      throw new Error('Test setup failed: agent');
    }
    agentId = createdAgent.id;

    const [createdVersion] = await db
      .insert(agentVersions)
      .values({
        agentId,
        organizationId: orgId,
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { role: 'protected-bot' },
        createdBy: userId,
      })
      .returning();
    if (!createdVersion) {
      throw new Error('Test setup failed: version');
    }
    versionId = createdVersion.id;
  });

  afterAll(async () => {
    await db.delete(agentVersions).where(eq(agentVersions.id, versionId));
    await db.delete(agents).where(eq(agents.id, agentId));
    await pool.end();
  });

  it('12. prevents deleting Organization when Agent exists (ON DELETE RESTRICT)', async () => {
    await expect(db.delete(organizations).where(eq(organizations.id, orgId))).rejects.toThrow();
  });

  it('13. prevents deleting Agent when AgentVersion exists (ON DELETE RESTRICT)', async () => {
    await expect(db.delete(agents).where(eq(agents.id, agentId))).rejects.toThrow();
  });

  it('14. protects user referenced by created_by from deletion (ON DELETE RESTRICT)', async () => {
    await expect(db.delete(user).where(eq(user.id, userId))).rejects.toThrow();
  });

  it('15. cross-tenant read predicates do not leak Agents across organizations', async () => {
    const foreignOrg = await orgRepo.createOrganization({
      slug: `foreign-org-${testSuffix}`,
      name: `Foreign Org ${testSuffix}`,
      status: 'ACTIVE',
    });
    if (!foreignOrg) {
      throw new Error('Foreign org creation failed');
    }

    const foreignAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.organizationId, foreignOrg.id));

    expect(foreignAgents).toHaveLength(0);
  });
});
