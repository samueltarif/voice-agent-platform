import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planContactImport, type TelephonyOriginationResult } from '@voice-agent/contracts';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCampaignLifecycleRepository } from './repositories/campaign-lifecycle-repository.js';
import { DrizzleOperationsOverviewRepository } from './repositories/operations-overview-repository.js';
import { DrizzleContactRepository } from './repositories/contact-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('operations-overview');

/**
 * 008-MVP4c — visão operacional da organização (dashboard/chamadas) a partir
 * do estado persistido: campanhas, tentativas da janela, sessões ao vivo,
 * custos do ledger e listagem mascarada — sempre escopada ao tenant.
 */
describe('008-MVP4c operations overview (PostgreSQL)', () => {
  const lifecycle = new DrizzleCampaignLifecycleRepository(tdb.db);
  const overviews = new DrizzleOperationsOverviewRepository(tdb.db);
  const contacts = new DrizzleContactRepository(tdb.db);
  const outbound = new DrizzleOutboundRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  const estimate = { estimatedCarrierMinorUnits: 300, estimatedConversationalMinorUnits: 200 };
  let fx: DurableOutboundFixture;
  let scope: { organizationId: string; campaignId: string };
  const jobs: string[] = [];
  const attemptIds: string[] = [];
  let batchAttempt = '';

  function runner(result: TelephonyOriginationResult) {
    return new DurableGuardedOriginationRunner({
      runner: new DurableOutboundOriginationRunner({
        db: tdb.db,
        attempts,
        ownerId: 'w',
        leaseMs: 60_000,
        now: () => new Date(),
        newEventId: randomUUID,
        origination: { providerName: 'fake', originate: async () => result },
        reconciliation: { reconcile: async () => ({ kind: 'INCONCLUSIVE' }) },
      }),
      attempts,
      budget,
    });
  }

  async function claimAndPrepare(jobId: string) {
    const org = scope.organizationId;
    const claimed = await outbound.claimJob({
      organizationId: org,
      jobId,
      workerId: 'w',
      now: new Date(Date.now() + 1000),
    });
    if (!claimed) throw new Error('job not claimed');
    const prepared = await attempts.prepareAttempt({
      organizationId: org,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    attemptIds.push(prepared.record.attempt.id);
    return { organizationId: org, attemptId: prepared.record.attempt.id };
  }

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
    const org = fx.tenantA.organizationId;
    const campaign = await outbound.createCampaign({
      organizationId: org,
      agentId: fx.tenantA.agentId,
      agentVersionId: fx.tenantA.agentVersionId,
      name: 'Relatório',
      status: 'DRAFT',
    });
    scope = { organizationId: org, campaignId: campaign.id };
    const list = await contacts.createList(org, 'Base relatório');
    if (list.kind !== 'CREATED') throw new Error(list.kind);
    const plan = planContactImport(
      'Telefone\n11 98100-0001\n11 98100-0002\n11 98100-0003\n11 98100-0004',
      { phoneColumn: 'Telefone' },
    );
    if (!plan.ok) throw new Error(plan.reason);
    await contacts.importIntoList({
      organizationId: org,
      listId: list.list.id,
      accepted: plan.accepted,
    });
    await lifecycle.assignAudience({ ...scope, contactListId: list.list.id });
    await lifecycle.applyAction({ ...scope, action: 'START', now: new Date() });
    const rows = await tdb.db.execute<{ id: string }>(
      sql`SELECT id FROM outbound_call_jobs WHERE campaign_id = ${campaign.id} ORDER BY destination_phone`,
    );
    jobs.push(...rows.rows.map((r) => r.id));

    const accepted = await claimAndPrepare(jobs[0]!);
    await runner({ kind: 'ACCEPTED', providerReference: 'ref-accepted' }).originate(
      accepted,
      estimate,
    );
    const settled = await budget.settleBudget({
      organizationId: org,
      attemptId: accepted.attemptId,
      actualCarrierCostMinorUnits: 150,
      actualConversationalCostMinorUnits: 100,
    });
    if (settled.kind !== 'SETTLED') throw new Error(settled.kind);
    const unknown = await claimAndPrepare(jobs[1]!);
    await runner({ kind: 'UNKNOWN', reasonCode: 'TRANSPORT_ERROR' }).originate(unknown, estimate);
    await claimAndPrepare(jobs[2]!);
    await lifecycle.applyAction({ ...scope, action: 'PAUSE', now: new Date() });
    const batchJob = await createExtraJob(tdb.db, {
      tenant: fx.tenantA,
      tag: 'batch',
      destinationPhone: '+5511981009999',
    });
    await tdb.db.execute(
      sql`UPDATE outbound_call_jobs SET campaign_id = NULL WHERE id = ${batchJob}`,
    );
    batchAttempt = (await claimAndPrepare(batchJob)).attemptId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  const now = () => new Date(Date.now() + 60_000);

  it('summarizes campaigns, attempts of the window, live sessions and ledger costs', async () => {
    const overview = await overviews.overview(scope.organizationId, {
      days: 7,
      includeCosts: true,
      now: now(),
    });
    expect(overview).toMatchObject({
      periodDays: 7,
      campaigns: {
        // a fixture cria uma campanha ACTIVE (com um job agendado) por tenant
        byStatus: { DRAFT: 0, ACTIVE: 1, PAUSED: 1, COMPLETED: 0, CANCELED: 0 },
        running: [
          {
            // a mais recentemente alterada (pausada agora) vem primeiro
            campaignId: scope.campaignId,
            status: 'PAUSED',
            progress: { total: 4, heldByPause: 1, inProgress: 2, scheduled: 1 },
          },
          // a fixture cria um job sem tentativa nessa campanha
          {
            campaignId: fx.tenantA.campaignId,
            status: 'ACTIVE',
            progress: { total: 1, scheduled: 1 },
          },
        ],
      },
      attempts: {
        total: 4,
        sent: 2,
        requiresManualReview: 0,
        byOutcome: {
          NOT_SENT_PENDING: 1,
          HELD_BY_PAUSE: 1,
          IN_FLIGHT: 1,
          OUTCOME_UNKNOWN: 1,
          NO_CALL_CREATED: 0,
          CANCELED_BEFORE_SEND: 0,
          ENDED: 0,
        },
      },
      liveSessions: 0,
      costs: {
        currency: 'USD',
        settled: { carrier: 150, conversational: 100, total: 250 },
        settledAttempts: 1,
        reservedOpen: { carrier: 300, conversational: 200, total: 500 },
        openReservations: 1,
      },
      handoffs: { available: false, reason: 'NOT_PERSISTED' },
      dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
    });
  });

  it('applies the period to attempts and settled costs, never to what is still reserved', async () => {
    const later = new Date(Date.now() + 10 * 86_400_000);
    const overview = await overviews.overview(scope.organizationId, {
      days: 7,
      includeCosts: true,
      now: later,
    });
    expect(overview.attempts.total).toBe(0);
    expect(overview.costs).toMatchObject({
      settled: { total: 0 },
      settledAttempts: 0,
      reservedOpen: { total: 500 },
    });
    expect(
      await overviews.listAttempts(scope.organizationId, {
        days: 7,
        limit: 50,
        offset: 0,
        now: later,
      }),
    ).toEqual([]);
  });

  it('hides costs from roles that may not see them', async () => {
    const overview = await overviews.overview(scope.organizationId, {
      days: 7,
      includeCosts: false,
      now: now(),
    });
    expect(overview.costs).toBeNull();
  });

  it('lists attempts of every campaign (and batch jobs) masked and filterable', async () => {
    const all = await overviews.listAttempts(scope.organizationId, {
      days: 7,
      limit: 50,
      offset: 0,
      now: now(),
    });
    expect(all.map((r) => [r.attemptId, r.outcome, r.campaignName])).toEqual([
      [batchAttempt, 'NOT_SENT_PENDING', null],
      [attemptIds[2], 'HELD_BY_PAUSE', 'Relatório'],
      [attemptIds[1], 'OUTCOME_UNKNOWN', 'Relatório'],
      [attemptIds[0], 'IN_FLIGHT', 'Relatório'],
    ]);
    expect(all[0]?.destinationMasked).toBe('+55 11 •••••-9999');
    expect(JSON.stringify(all)).not.toMatch(/\+55119810/);
    const q = (outcome: 'HELD_BY_PAUSE' | 'NOT_SENT_PENDING') =>
      overviews.listAttempts(scope.organizationId, {
        days: 7,
        limit: 50,
        offset: 0,
        outcome,
        now: now(),
      });
    expect((await q('HELD_BY_PAUSE')).map((r) => r.attemptId)).toEqual([attemptIds[2]]);
    expect((await q('NOT_SENT_PENDING')).map((r) => r.attemptId)).toEqual([batchAttempt]);
  });

  it('never mixes tenants', async () => {
    const other = await overviews.overview(fx.tenantB.organizationId, {
      days: 7,
      includeCosts: true,
      now: now(),
    });
    expect(other.attempts.total).toBe(0);
    expect(other.campaigns.running.map((c) => [c.campaignId, c.progress.total])).toEqual([
      [fx.tenantB.campaignId, 1],
    ]);
    expect(other.costs?.settled.total).toBe(0);
    expect(
      await overviews.listAttempts(fx.tenantB.organizationId, {
        days: 7,
        limit: 50,
        offset: 0,
        now: now(),
      }),
    ).toEqual([]);
  });
});
