import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('campaign-dispatch-gating');

/**
 * 008-MVP2: pausar/cancelar precisa ser EFETIVO no worker — um job de campanha
 * PAUSED/CANCELED/COMPLETED nunca é reivindicado, por nenhuma das vias de claim.
 */
describe('008-MVP2 dispatch gating by campaign status', () => {
  const outbound = new DrizzleOutboundRepository(tdb.db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  const setStatus = (status: string) =>
    tdb.db.execute(
      sql`UPDATE outbound_campaigns SET status = ${status} WHERE id = ${fx.tenantB.campaignId}`,
    );

  it.each(['PAUSED', 'CANCELED', 'COMPLETED'])(
    'never claims jobs of a %s campaign (next-due and direct claims)',
    async (status) => {
      const jobId = await createExtraJob(tdb.db, { tenant: fx.tenantB, tag: `gate-${status}` });
      await setStatus(status);
      try {
        const orgId = fx.tenantB.organizationId;
        expect(await outbound.claimNextDueJob({ organizationId: orgId, workerId: 'w' })).toBeNull();
        expect(await outbound.claimJob({ organizationId: orgId, jobId, workerId: 'w' })).toBeNull();
      } finally {
        await setStatus('ACTIVE');
      }
      const resumed = await outbound.claimJob({
        organizationId: fx.tenantB.organizationId,
        jobId,
        workerId: 'w',
      });
      expect(resumed?.id).toBe(jobId);
    },
  );
});
