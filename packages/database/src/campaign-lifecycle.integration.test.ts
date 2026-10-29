import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planContactImport } from '@voice-agent/contracts';
import { DrizzleCampaignLifecycleRepository } from './repositories/campaign-lifecycle-repository.js';
import { DrizzleContactRepository } from './repositories/contact-repository.js';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('campaign-lifecycle');

/** 008-MVP2 — audiência, START/PAUSE/RESUME/CANCEL e progresso real (PostgreSQL). */
describe('008-MVP2 campaign lifecycle', () => {
  const lifecycle = new DrizzleCampaignLifecycleRepository(tdb.db);
  const contacts = new DrizzleContactRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  const outbound = new DrizzleOutboundRepository(tdb.db);
  const now = new Date();
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function draftCampaign(tenant: TenantFixture, name: string) {
    const campaign = await outbound.createCampaign({
      organizationId: tenant.organizationId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      name,
    });
    return { organizationId: tenant.organizationId, campaignId: campaign.id };
  }

  async function listWith(tenant: TenantFixture, name: string, phones: string[]) {
    const list = await contacts.createList(tenant.organizationId, name);
    if (list.kind !== 'CREATED') throw new Error(list.kind);
    const plan = planContactImport(`Telefone\n${phones.join('\n')}`, { phoneColumn: 'Telefone' });
    if (!plan.ok) throw new Error(plan.reason);
    await contacts.importIntoList({
      organizationId: tenant.organizationId,
      listId: list.list.id,
      accepted: plan.accepted,
    });
    return list.list.id;
  }

  const act = (
    scope: { organizationId: string; campaignId: string },
    action: 'START' | 'PAUSE' | 'RESUME' | 'CANCEL',
  ) => lifecycle.applyAction({ ...scope, action, now });

  it('starts only with an audience and materializes one job per ELIGIBLE contact, idempotently', async () => {
    const scope = await draftCampaign(fx.tenantA, 'Reativação');
    expect(await act(scope, 'START')).toEqual({ kind: 'REJECTED', reason: 'AUDIENCE_REQUIRED' });
    const listId = await listWith(fx.tenantA, 'Base A', [
      '11 91111-0001',
      '11 91111-0002',
      '11 91111-0003',
    ]);
    await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511911110002',
      reason: 'OPT_OUT',
    });
    expect(await lifecycle.assignAudience({ ...scope, contactListId: listId })).toEqual({
      kind: 'ASSIGNED',
    });
    expect(await act(scope, 'START')).toEqual({
      kind: 'TRANSITIONED',
      status: 'ACTIVE',
      jobsCreated: 2,
      jobsCanceled: 0,
    });
    expect(await act(scope, 'START')).toEqual({ kind: 'REJECTED', reason: 'INVALID_TRANSITION' });
    const jobs = await tdb.db.execute<{ phone: string }>(
      sql`SELECT destination_phone AS phone FROM outbound_call_jobs WHERE campaign_id = ${scope.campaignId} ORDER BY 1`,
    );
    expect(jobs.rows.map((r) => r.phone)).toEqual(['+5511911110001', '+5511911110003']);
    expect(await lifecycle.progress(scope)).toEqual({
      total: 2,
      scheduled: 2,
      inProgress: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
    });
  });

  it('refuses audiences from another tenant and changes after the draft phase', async () => {
    const scope = await draftCampaign(fx.tenantA, 'Isolada');
    const foreignList = await listWith(fx.tenantB, 'Base B', ['11 92222-0001']);
    expect(await lifecycle.assignAudience({ ...scope, contactListId: foreignList })).toEqual({
      kind: 'REJECTED',
      reason: 'LIST_NOT_FOUND',
    });
    expect(
      await lifecycle.applyAction({
        organizationId: fx.tenantB.organizationId,
        campaignId: scope.campaignId,
        action: 'CANCEL',
        now,
      }),
    ).toEqual({
      kind: 'REJECTED',
      reason: 'NOT_FOUND',
    });
    const ownList = await listWith(fx.tenantA, 'Base A2', ['11 92222-0002']);
    await lifecycle.assignAudience({ ...scope, contactListId: ownList });
    await act(scope, 'START');
    expect(await lifecycle.assignAudience({ ...scope, contactListId: ownList })).toEqual({
      kind: 'REJECTED',
      reason: 'NOT_DRAFT',
    });
  });

  it('rolls back a start with no eligible contacts or an archived agent', async () => {
    const scope = await draftCampaign(fx.tenantA, 'Sem elegíveis');
    const listId = await listWith(fx.tenantA, 'Só suprimidos', ['11 93333-0001']);
    await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511933330001',
      reason: 'MANUAL',
    });
    await lifecycle.assignAudience({ ...scope, contactListId: listId });
    expect(await act(scope, 'START')).toEqual({ kind: 'REJECTED', reason: 'NO_ELIGIBLE_CONTACTS' });
    expect((await outbound.getCampaignById(scope.organizationId, scope.campaignId))?.status).toBe(
      'DRAFT',
    );

    const archived = await draftCampaign(fx.tenantB, 'Agente arquivado');
    await lifecycle.assignAudience({
      ...archived,
      contactListId: await listWith(fx.tenantB, 'Base B2', ['11 93333-0002']),
    });
    await tdb.db.execute(
      sql`UPDATE agents SET status = 'ARCHIVED' WHERE id = ${fx.tenantB.agentId}`,
    );
    try {
      expect(await act(archived, 'START')).toEqual({
        kind: 'REJECTED',
        reason: 'AGENT_NOT_ACTIVE',
      });
      expect(await lifecycle.progress(archived)).toMatchObject({ total: 0 });
    } finally {
      await tdb.db.execute(
        sql`UPDATE agents SET status = 'ACTIVE' WHERE id = ${fx.tenantB.agentId}`,
      );
    }
  });

  it('pause stops dispatch, resume restores it, cancel withdraws pending jobs only', async () => {
    const scope = await draftCampaign(fx.tenantA, 'Operação');
    await lifecycle.assignAudience({
      ...scope,
      contactListId: await listWith(fx.tenantA, 'Base Op', ['11 94444-0001', '11 94444-0002']),
    });
    await act(scope, 'START');
    const jobIds = (
      await tdb.db.execute<{ id: string }>(
        sql`SELECT id FROM outbound_call_jobs WHERE campaign_id = ${scope.campaignId} ORDER BY id`,
      )
    ).rows.map((r) => r.id);
    const claim = (jobId: string) =>
      outbound.claimJob({
        organizationId: scope.organizationId,
        jobId,
        workerId: 'w',
        now: new Date(Date.now() + 1000),
      });
    expect((await claim(jobIds[0]!))?.id).toBe(jobIds[0]);
    expect(await act(scope, 'PAUSE')).toMatchObject({ status: 'PAUSED' });
    expect(await claim(jobIds[1]!)).toBeNull();
    expect(await act(scope, 'RESUME')).toMatchObject({ status: 'ACTIVE' });
    expect(await act(scope, 'CANCEL')).toEqual({
      kind: 'TRANSITIONED',
      status: 'CANCELED',
      jobsCreated: 0,
      jobsCanceled: 1,
    });
    expect(await claim(jobIds[1]!)).toBeNull();
    expect(await lifecycle.progress(scope)).toMatchObject({
      total: 2,
      inProgress: 1,
      canceled: 1,
      scheduled: 0,
    });
    expect(await act(scope, 'RESUME')).toEqual({ kind: 'REJECTED', reason: 'INVALID_TRANSITION' });
  });

  it('serializes concurrent operations: one START wins and jobs are never duplicated', async () => {
    const scope = await draftCampaign(fx.tenantB, 'Concorrência');
    await lifecycle.assignAudience({
      ...scope,
      contactListId: await listWith(fx.tenantB, 'Base C', ['11 98888-0001', '11 98888-0002']),
    });
    const outcomes = await Promise.all([
      act(scope, 'START'),
      act(scope, 'START'),
      act(scope, 'START'),
      act(scope, 'CANCEL'),
    ]);
    const kinds = outcomes.map((o) => (o.kind === 'TRANSITIONED' ? o.status : o.reason)).sort();
    const started = outcomes.filter((o) => o.kind === 'TRANSITIONED' && o.status === 'ACTIVE');
    expect(started.length).toBeLessThanOrEqual(1);
    expect(kinds.filter((k) => k === 'CANCELED')).toHaveLength(1);
    const total = (await lifecycle.progress(scope)).total;
    expect(total).toBe(started.length === 1 ? 2 : 0);
  });
});
