import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { user } from './schema/auth.js';
import { agents, agentVersions } from './schema/agents.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Agent and AgentVersion Database Constraints (Postgres Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userId = `usr_agent_test_${testSuffix}`;
  let orgAId: string;
  let orgBId: string;
  let agentAId: string;

  beforeAll(async () => {
    await db
      .insert(user)
      .values([
        { id: userId, name: 'Agent Tester', email: `agent_test_${testSuffix}@example.com` },
      ]);

    const orgA = await orgRepo.createOrganization({
      slug: `org-ag-a-${testSuffix}`,
      name: `Org Agent A ${testSuffix}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `org-ag-b-${testSuffix}`,
      name: `Org Agent B ${testSuffix}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) {
      throw new Error('Test setup failed: organizations');
    }
    orgAId = orgA.id;
    orgBId = orgB.id;

    const [createdAgent] = await db
      .insert(agents)
      .values({
        organizationId: orgAId,
        name: 'Agent A1',
        slug: 'sales-agent',
        status: 'ACTIVE',
      })
      .returning();
    if (!createdAgent) {
      throw new Error('Test setup failed: agent');
    }
    agentAId = createdAgent.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('1. rejects duplicate slug within the SAME organization', async () => {
    await expect(
      db.insert(agents).values({
        organizationId: orgAId,
        name: 'Duplicate Agent',
        slug: 'sales-agent',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow();
  });

  it('2. permits the same slug in DIFFERENT organizations', async () => {
    const [agentInOrgB] = await db
      .insert(agents)
      .values({
        organizationId: orgBId,
        name: 'Agent B1',
        slug: 'sales-agent',
        status: 'ACTIVE',
      })
      .returning();
    if (!agentInOrgB) {
      throw new Error('Agent in Org B creation failed');
    }

    expect(agentInOrgB.slug).toBe('sales-agent');
    expect(agentInOrgB.organizationId).toBe(orgBId);
  });

  it('3. rejects agent_version referencing agent of Org A with organization_id of Org B (composite FK)', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgBId, // Cross-tenant mismatch!
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { role: 'bot' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('4. rejects version_number <= 0 via CHECK constraint', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 0,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { role: 'bot' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('5. rejects configuration_schema_version <= 0 via CHECK constraint', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 0,
        configuration: { role: 'bot' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('6. rejects non-object configuration via jsonb_typeof CHECK constraint', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 1,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: 'not-an-object' as unknown as Record<string, unknown>,
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('7. rejects second DRAFT for the same Agent via partial unique index', async () => {
    await db.insert(agentVersions).values({
      agentId: agentAId,
      organizationId: orgAId,
      versionNumber: 1,
      status: 'DRAFT',
      configurationSchemaVersion: 1,
      configuration: { role: 'draft-1' },
      createdBy: userId,
    });

    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 2,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { role: 'draft-2' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('8. rejects second PUBLISHED version for the same Agent via partial unique index', async () => {
    // Delete existing draft to keep clean state
    await db.delete(agentVersions);

    await db.insert(agentVersions).values({
      agentId: agentAId,
      organizationId: orgAId,
      versionNumber: 1,
      status: 'PUBLISHED',
      configurationSchemaVersion: 1,
      configuration: { role: 'pub-1' },
      createdBy: userId,
      publishedAt: new Date(),
      publishedBy: userId,
    });

    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 2,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: { role: 'pub-2' },
        createdBy: userId,
        publishedAt: new Date(),
        publishedBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('9. rejects DRAFT with published_at or published_by populated (metadata CHECK)', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 3,
        status: 'DRAFT',
        configurationSchemaVersion: 1,
        configuration: { role: 'invalid-draft' },
        createdBy: userId,
        publishedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('10. rejects PUBLISHED without published_at/by (metadata CHECK)', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 4,
        status: 'PUBLISHED',
        configurationSchemaVersion: 1,
        configuration: { role: 'missing-metadata' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('11. rejects ARCHIVED without historical publish metadata (metadata CHECK)', async () => {
    await expect(
      db.insert(agentVersions).values({
        agentId: agentAId,
        organizationId: orgAId,
        versionNumber: 5,
        status: 'ARCHIVED',
        configurationSchemaVersion: 1,
        configuration: { role: 'missing-archived-metadata' },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });
});
