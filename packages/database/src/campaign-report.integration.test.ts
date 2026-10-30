import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planContactImport, type TelephonyOriginationResult } from '@voice-agent/contracts';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCampaignLifecycleRepository } from './repositories/campaign-lifecycle-repository.js';
import { DrizzleCampaignReportRepository } from './repositories/campaign-report-repository.js';
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

const tdb = await createDisposableTestDatabase('campaign-report');

/**
 * 008-MVP4 — relatório da campanha a partir do estado persistido: progresso
 * com jobs retidos pela pausa, tentativas por classe de desfecho, custos do
 * ledger (liquidado × reservado) e listagem com telefone mascarado.
 */
describe('008-MVP4 campaign report (PostgreSQL)', () => {
  const lifecycle = new DrizzleCampaignLifecycleRepository(tdb.db);
  const reports = new DrizzleCampaignReportRepository(tdb.db);
  const contacts = new DrizzleContactRepository(tdb.db);
  const outbound = new DrizzleOutboundRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  const estimate = { estimatedCarrierMinorUnits: 300, estimatedConversationalMinorUnits: 200 };
  let fx: DurableOutboundFixture;
  let scope: { organizationId: string; campaignId: string };
  const jobs: string[] = [];
  const attemptIds: string[] = [];

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
  });

  afterAll(async () => {
    await tdb.drop();
  });

  it('progress separates jobs held by the pause from jobs really in progress', async () => {
    expect(await lifecycle.progress(scope)).toEqual({
      total: 4,
      scheduled: 1,
      inProgress: 2,
      heldByPause: 1,
      completed: 0,
      failed: 0,
      canceled: 0,
    });
  });

  it('reports attempts by persisted outcome class and only ledger costs', async () => {
    const report = await reports.report(scope, { includeCosts: true });
    expect(report).toEqual({
      campaignId: scope.campaignId,
      campaignStatus: 'PAUSED',
      progress: expect.objectContaining({ heldByPause: 1, inProgress: 2 }),
      attempts: {
        total: 3,
        sent: 2,
        requiresManualReview: 0,
        byOutcome: {
          NOT_SENT_PENDING: 0,
          HELD_BY_PAUSE: 1,
          IN_FLIGHT: 1,
          OUTCOME_UNKNOWN: 1,
          NO_CALL_CREATED: 0,
          CANCELED_BEFORE_SEND: 0,
          ENDED: 0,
        },
      },
      costs: {
        currency: 'USD',
        settled: { carrier: 150, conversational: 100, total: 250 },
        settledAttempts: 1,
        reservedOpen: { carrier: 300, conversational: 200, total: 500 },
        openReservations: 1,
      },
      dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
    });
  });

  it('omits costs when the caller may not see them', async () => {
    expect((await reports.report(scope, { includeCosts: false }))?.costs).toBeNull();
  });

  it('lists attempts with masked phones, newest first, filterable by outcome', async () => {
    const page = await reports.listAttempts(scope, { limit: 50, offset: 0 });
    expect(page?.map((r) => [r.attemptId, r.outcome, r.sent, r.destinationMasked])).toEqual([
      [attemptIds[2], 'HELD_BY_PAUSE', false, '+55 11 •••••-0003'],
      [attemptIds[1], 'OUTCOME_UNKNOWN', true, '+55 11 •••••-0002'],
      [attemptIds[0], 'IN_FLIGHT', true, '+55 11 •••••-0001'],
    ]);
    expect(page?.every((r) => r.callDurationSeconds === null)).toBe(true);
    expect(JSON.stringify(page)).not.toContain('981000001');
    const held = await reports.listAttempts(scope, {
      limit: 50,
      offset: 0,
      outcome: 'HELD_BY_PAUSE',
    });
    expect(held?.map((r) => r.attemptId)).toEqual([attemptIds[2]]);
    const second = await reports.listAttempts(scope, { limit: 1, offset: 1 });
    expect(second?.map((r) => r.attemptId)).toEqual([attemptIds[1]]);
  });

  it('never reveals another tenant campaign (null = 404)', async () => {
    const foreign = { organizationId: fx.tenantB.organizationId, campaignId: scope.campaignId };
    expect(await reports.report(foreign, { includeCosts: true })).toBeNull();
    expect(await reports.listAttempts(foreign, { limit: 50, offset: 0 })).toBeNull();
  });
});
