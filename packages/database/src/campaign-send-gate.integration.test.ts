import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planContactImport } from '@voice-agent/contracts';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCampaignLifecycleRepository } from './repositories/campaign-lifecycle-repository.js';
import { DrizzleContactRepository } from './repositories/contact-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('campaign-send-gate');

/**
 * 008-MVP2 (auditoria pós-merge da #128): PAUSE/CANCEL bloqueiam novos claims
 * de job, mas um job JÁ reivindicado com tentativa ainda não enviada também
 * precisa respeitar a campanha na barreira de envio (`claimSend`):
 * - CANCELED → tentativa cancelada (nada enviado, orçamento liberado), job CANCELED;
 * - PAUSED → nada é enviado e a tentativa permanece pendente para retomar;
 * - tentativa já enviada segue sua FSM (cancelar não "desliga" chamadas em curso).
 */
describe('008-MVP2 campaign status at the send gate', () => {
  const holder = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 1 });
  const lifecycle = new DrizzleCampaignLifecycleRepository(tdb.db);
  const contacts = new DrizzleContactRepository(tdb.db);
  const outbound = new DrizzleOutboundRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  const estimate = { estimatedCarrierMinorUnits: 300, estimatedConversationalMinorUnits: 200 };
  let fx: DurableOutboundFixture;
  let phoneSeq = 0;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    await budget.provisionGlobalLedger({
      allocatedBudgetMinorUnits: 1_000_000,
      maxConcurrentCalls: 50,
    });
    await budget.provisionLedger({
      organizationId: fx.tenantA.organizationId,
      allocatedBudgetMinorUnits: 100_000,
      maxConcurrentCalls: 50,
    });
  });

  afterAll(async () => {
    await holder.pool.end();
    await tdb.drop();
  });

  /** Campanha ACTIVE com um job; job reivindicado e tentativa preparada (ORIGINATION_PENDING). */
  async function claimedAttempt() {
    const org = fx.tenantA.organizationId;
    const campaign = await outbound.createCampaign({
      organizationId: org,
      agentId: fx.tenantA.agentId,
      agentVersionId: fx.tenantA.agentVersionId,
      name: `Gate ${++phoneSeq}`,
      status: 'DRAFT',
    });
    const scope = { organizationId: org, campaignId: campaign.id };
    const list = await contacts.createList(org, `Lista ${phoneSeq}`);
    if (list.kind !== 'CREATED') throw new Error(list.kind);
    const plan = planContactImport(`Telefone\n11 977${String(phoneSeq).padStart(2, '0')}-0001`, {
      phoneColumn: 'Telefone',
    });
    if (!plan.ok) throw new Error(plan.reason);
    await contacts.importIntoList({
      organizationId: org,
      listId: list.list.id,
      accepted: plan.accepted,
    });
    await lifecycle.assignAudience({ ...scope, contactListId: list.list.id });
    await lifecycle.applyAction({ ...scope, action: 'START', now: new Date() });
    const [job] = (
      await tdb.db.execute<{ id: string }>(
        sql`SELECT id FROM outbound_call_jobs WHERE campaign_id = ${campaign.id}`,
      )
    ).rows;
    const claimed = await outbound.claimJob({
      organizationId: org,
      jobId: job!.id,
      workerId: 'w',
      now: new Date(Date.now() + 1000),
    });
    if (!claimed) throw new Error('job not claimed');
    const prepared = await attempts.prepareAttempt({
      organizationId: org,
      jobId: job!.id,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    return {
      scope,
      jobId: job!.id,
      attempt: { organizationId: org, attemptId: prepared.record.attempt.id },
    };
  }

  function runner(calls: { count: number }) {
    return new DurableGuardedOriginationRunner({
      runner: new DurableOutboundOriginationRunner({
        db: tdb.db,
        attempts,
        ownerId: 'w',
        leaseMs: 60_000,
        now: () => new Date(),
        newEventId: randomUUID,
        origination: {
          providerName: 'fake',
          originate: async () => {
            calls.count += 1;
            return { kind: 'ACCEPTED', providerReference: `ref-${randomUUID()}` };
          },
        },
        reconciliation: { reconcile: async () => ({ kind: 'INCONCLUSIVE' }) },
      }),
      attempts,
      budget,
    });
  }

  const act = (
    scope: { organizationId: string; campaignId: string },
    action: 'PAUSE' | 'RESUME' | 'CANCEL',
  ) => lifecycle.applyAction({ ...scope, action, now: new Date() });

  const jobStatus = async (jobId: string) =>
    (
      await tdb.db.execute<{ status: string }>(
        sql`SELECT status FROM outbound_call_jobs WHERE id = ${jobId}`,
      )
    ).rows[0]?.status;

  it('cancel: an already-claimed, unsent attempt is canceled at the send gate and never dials', async () => {
    const { scope, jobId, attempt } = await claimedAttempt();
    const before = await budget.getLedger(fx.tenantA.organizationId);
    expect(await act(scope, 'CANCEL')).toMatchObject({ status: 'CANCELED' });
    const calls = { count: 0 };
    expect(await runner(calls).originate(attempt, estimate)).toEqual({
      kind: 'NOT_SENT',
      reason: 'CAMPAIGN_CANCELED',
    });
    expect(calls.count).toBe(0);
    expect((await attempts.getById(attempt))?.attempt.state).toBe('CANCELED');
    expect(await jobStatus(jobId)).toBe('CANCELED');
    expect((await budget.getLedger(fx.tenantA.organizationId))?.reservedAmountMinorUnits).toBe(
      before?.reservedAmountMinorUnits,
    );
  });

  it('pause: nothing is sent and the pending attempt resumes after RESUME', async () => {
    const { scope, attempt } = await claimedAttempt();
    expect(await act(scope, 'PAUSE')).toMatchObject({ status: 'PAUSED' });
    const calls = { count: 0 };
    expect(await runner(calls).originate(attempt, estimate)).toEqual({
      kind: 'NOT_SENT',
      reason: 'CAMPAIGN_PAUSED',
    });
    expect(calls.count).toBe(0);
    expect((await attempts.getById(attempt))?.attempt.state).toBe('ORIGINATION_PENDING');
    expect(await act(scope, 'RESUME')).toMatchObject({ status: 'ACTIVE' });
    expect((await runner(calls).originate(attempt, estimate)).kind).toBe('COMPLETED');
    expect(calls.count).toBe(1);
  });

  it('pause holds the reservation; a later CANCEL releases it without ever dialing', async () => {
    const { scope, attempt } = await claimedAttempt();
    const before = await budget.getLedger(fx.tenantA.organizationId);
    await act(scope, 'PAUSE');
    const calls = { count: 0 };
    await runner(calls).originate(attempt, estimate);
    const held = await budget.getLedger(fx.tenantA.organizationId);
    expect(held!.reservedAmountMinorUnits).toBeGreaterThan(before!.reservedAmountMinorUnits);
    await act(scope, 'CANCEL');
    expect(await runner(calls).originate(attempt, estimate)).toEqual({
      kind: 'NOT_SENT',
      reason: 'CAMPAIGN_CANCELED',
    });
    expect(calls.count).toBe(0);
    expect((await budget.getLedger(fx.tenantA.organizationId))?.reservedAmountMinorUnits).toBe(
      before?.reservedAmountMinorUnits,
    );
  });

  it('an attempt already sent keeps its lifecycle after CANCEL (in-flight calls are not recalled)', async () => {
    const { scope, jobId, attempt } = await claimedAttempt();
    const calls = { count: 0 };
    expect((await runner(calls).originate(attempt, estimate)).kind).toBe('COMPLETED');
    expect(await act(scope, 'CANCEL')).toMatchObject({ status: 'CANCELED', jobsCanceled: 0 });
    expect((await attempts.getById(attempt))?.attempt.state).toBe('ORIGINATION_ACCEPTED');
    expect(await jobStatus(jobId)).toBe('CLAIMED');
  });

  it('the send decision waits for an in-flight campaign transition (linearized)', async () => {
    const { scope, attempt } = await claimedAttempt();
    const client = await holder.pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM outbound_campaigns WHERE id = $1 FOR UPDATE', [
      scope.campaignId,
    ]);
    const calls = { count: 0 };
    const pending = runner(calls).originate(attempt, estimate);
    try {
      const timer = new Promise<'pending'>((r) => setTimeout(() => r('pending'), 300));
      expect(await Promise.race([pending.then(() => 'done' as const), timer])).toBe('pending');
      await client.query("UPDATE outbound_campaigns SET status = 'CANCELED' WHERE id = $1", [
        scope.campaignId,
      ]);
    } finally {
      await client.query('COMMIT');
      client.release();
    }
    expect(await pending).toEqual({ kind: 'NOT_SENT', reason: 'CAMPAIGN_CANCELED' });
    expect(calls.count).toBe(0);
  });
});
