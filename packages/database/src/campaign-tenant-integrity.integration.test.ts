import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('campaign-tenant-integrity');

/**
 * 008-MVP2 (auditoria): campanha nunca referencia agente/versão de outro tenant.
 * A aplicação já validava; o banco passa a garantir o mesmo (defesa em profundidade).
 */
describe('008-MVP2 campaign agent references are tenant-bound', () => {
  const outbound = new DrizzleOutboundRepository(tdb.db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  it('the repository refuses agent versions of another tenant (pre-existing application check)', async () => {
    await expect(
      outbound.createCampaign({
        organizationId: fx.tenantA.organizationId,
        agentId: fx.tenantB.agentId,
        agentVersionId: fx.tenantB.agentVersionId,
        name: 'cross-tenant',
      }),
    ).rejects.toThrow(/must be PUBLISHED/);
  });

  it.each([
    ['agent and version of tenant B', 'tenantB', 'tenantB'],
    ['own agent with a version of tenant B', 'tenantA', 'tenantB'],
  ] as const)(
    'the database itself rejects a raw insert using %s',
    async (_label, agentOf, versionOf) => {
      let failure: ReturnType<typeof classifyPostgresFailure> | null = null;
      try {
        await tdb.db.execute(sql`
        INSERT INTO outbound_campaigns (organization_id, agent_id, agent_version_id, name)
        VALUES (${fx.tenantA.organizationId}, ${fx[agentOf].agentId}, ${fx[versionOf].agentVersionId}, 'raw')`);
      } catch (error) {
        failure = classifyPostgresFailure(error);
      }
      expect(failure?.kind).toBe('FOREIGN_KEY_VIOLATION');
    },
  );
});
