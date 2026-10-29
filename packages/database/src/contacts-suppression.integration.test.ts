import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planContactImport } from '@voice-agent/contracts';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleContactRepository } from './repositories/contact-repository.js';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleOutboundBudgetRepository } from './repositories/outbound-budget-repository.js';
import { DurableGuardedOriginationRunner } from './repositories/durable-guarded-origination-runner.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('contacts-suppression');

/** 008-MVP1 — contatos, listas, supressão e elegibilidade fail-closed (PostgreSQL real). */
describe('008-MVP1 contacts, audiences and suppression', () => {
  const contactsRepo = new DrizzleContactRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  let fx: DurableOutboundFixture;

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
    await tdb.drop();
  });

  async function listFor(tenant: TenantFixture, name: string) {
    const created = await contactsRepo.createList(tenant.organizationId, name);
    if (created.kind !== 'CREATED') throw new Error(created.kind);
    return created.list.id;
  }

  async function importCsv(tenant: TenantFixture, listId: string, csv: string) {
    const plan = planContactImport(csv, { phoneColumn: 'Telefone', nameColumn: 'Nome' });
    if (!plan.ok) throw new Error(plan.reason);
    return contactsRepo.importIntoList({
      organizationId: tenant.organizationId,
      listId,
      accepted: plan.accepted,
    });
  }

  const failureOf = async (work: Promise<unknown>) => {
    try {
      await work;
    } catch (error) {
      return classifyPostgresFailure(error);
    }
    return null;
  };

  it('imports deterministically: existing contacts are kept and only linked to the new list', async () => {
    const first = await listFor(fx.tenantA, 'Clientes');
    const second = await listFor(fx.tenantA, 'Reativação');
    expect(
      await importCsv(fx.tenantA, first, 'Nome,Telefone\nAna,(11) 98765-4321\nBia,21 3456-7890'),
    ).toEqual({
      kind: 'IMPORTED',
      created: 2,
      existing: 0,
      addedToList: 2,
      suppressed: 0,
    });
    expect(await importCsv(fx.tenantA, second, 'Nome,Telefone\nOutro Nome,+5511987654321')).toEqual(
      {
        kind: 'IMPORTED',
        created: 0,
        existing: 1,
        addedToList: 1,
        suppressed: 0,
      },
    );
    const members = await contactsRepo.listMembers({
      organizationId: fx.tenantA.organizationId,
      listId: second,
      eligibility: 'ALL',
      limit: 10,
      offset: 0,
    });
    expect(members.map((m) => [m.phoneE164, m.displayName])).toEqual([['+5511987654321', 'Ana']]);
    expect((await contactsRepo.createList(fx.tenantA.organizationId, 'Clientes')).kind).toBe(
      'NAME_TAKEN',
    );
  });

  it('isolates tenants: no import into, or read of, another tenant list', async () => {
    const listA = await listFor(fx.tenantA, 'Somente A');
    await importCsv(fx.tenantA, listA, 'Nome,Telefone\nCarla,11 99876-5432');
    expect(await importCsv(fx.tenantB, listA, 'Nome,Telefone\nIntrusa,11 99876-5433')).toEqual({
      kind: 'LIST_NOT_FOUND',
    });
    const leaked = await contactsRepo.listMembers({
      organizationId: fx.tenantB.organizationId,
      listId: listA,
      eligibility: 'ALL',
      limit: 10,
      offset: 0,
    });
    expect(leaked).toEqual([]);
    expect(await contactsRepo.listLists(fx.tenantB.organizationId)).toEqual([]);
  });

  it('excludes suppressed numbers from eligibility, per tenant only, and keeps the original reason', async () => {
    const listA = await listFor(fx.tenantA, 'Elegibilidade');
    const listB = await listFor(fx.tenantB, 'Elegibilidade');
    const csv = 'Nome,Telefone\nDani,11 97777-0001\nEdu,11 97777-0002';
    await importCsv(fx.tenantA, listA, csv);
    await importCsv(fx.tenantB, listB, csv);
    const first = await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511977770001',
      reason: 'OPT_OUT',
      evidenceReference: 'protocolo-1',
    });
    const again = await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511977770001',
      reason: 'MANUAL',
    });
    expect(first.kind).toBe('SUPPRESSED');
    expect(again).toMatchObject({
      kind: 'ALREADY_SUPPRESSED',
      suppression: { reason: 'OPT_OUT', evidenceReference: 'protocolo-1' },
    });
    const eligible = (org: string, listId: string) =>
      contactsRepo.listMembers({
        organizationId: org,
        listId,
        eligibility: 'ELIGIBLE',
        limit: 10,
        offset: 0,
      });
    expect((await eligible(fx.tenantA.organizationId, listA)).map((m) => m.phoneE164)).toEqual([
      '+5511977770002',
    ]);
    expect(await eligible(fx.tenantB.organizationId, listB)).toHaveLength(2);
    expect(await importCsv(fx.tenantA, listA, 'Nome,Telefone\nDani,11 97777-0001')).toMatchObject({
      suppressed: 1,
    });
  });

  it('makes it impossible to create or retarget a job to a suppressed number (database trigger)', async () => {
    await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511966660001',
      reason: 'DO_NOT_CALL_REGISTRY',
    });
    const blocked = await failureOf(
      createExtraJob(tdb.db, {
        tenant: fx.tenantA,
        tag: 'sup',
        destinationPhone: '+5511966660001',
      }),
    );
    expect(blocked).toEqual({
      kind: 'CHECK_VIOLATION',
      constraint: 'outbound_call_jobs_destination_not_suppressed',
    });
    const jobId = await createExtraJob(tdb.db, {
      tenant: fx.tenantA,
      tag: 'ok',
      destinationPhone: '+5511966660002',
    });
    const retarget = await failureOf(
      tdb.db.execute(
        sql`UPDATE outbound_call_jobs SET destination_phone = '+5511966660001' WHERE id = ${jobId}`,
      ),
    );
    expect(retarget?.kind).toBe('CHECK_VIOLATION');
    await expect(
      createExtraJob(tdb.db, { tenant: fx.tenantB, tag: 'b', destinationPhone: '+5511966660001' }),
    ).resolves.toBeTypeOf('string');
  });

  async function preparedOn(destinationPhone: string) {
    const jobId = await createExtraJob(tdb.db, {
      tenant: fx.tenantA,
      tag: 'send',
      destinationPhone,
    });
    const prepared = await attempts.prepareAttempt({
      organizationId: fx.tenantA.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    return { organizationId: fx.tenantA.organizationId, attemptId: prepared.record.attempt.id };
  }

  function guardedRunner(calls: { count: number }) {
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
            return { kind: 'ACCEPTED', providerReference: 'x' };
          },
        },
        reconciliation: { reconcile: async () => ({ kind: 'INCONCLUSIVE' }) },
      }),
      attempts,
      budget,
    });
  }

  it('blocks at send time a number suppressed after the job was created, cancels and releases funds', async () => {
    const scope = await preparedOn('+5511955550001');
    await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511955550001',
      reason: 'OPT_OUT',
    });
    const calls = { count: 0 };
    const before = await budget.getLedger(fx.tenantA.organizationId);
    const result = await guardedRunner(calls).originate(scope, {
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
    });
    expect(result).toEqual({ kind: 'NOT_SENT', reason: 'DESTINATION_SUPPRESSED' });
    expect(calls.count).toBe(0);
    expect((await attempts.getById(scope))?.attempt.state).toBe('CANCELED');
    expect((await budget.getLedger(fx.tenantA.organizationId))?.reservedAmountMinorUnits).toBe(
      before?.reservedAmountMinorUnits,
    );
  });

  it('never dials a suppressed number written in a non-E.164 format', async () => {
    await suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511944440001',
      reason: 'MANUAL',
    });
    const scope = await preparedOn('(11) 94444-0001');
    const calls = { count: 0 };
    const result = await guardedRunner(calls).originate(scope, {
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
    });
    expect(result.kind).toBe('NOT_SENT');
    expect(calls.count).toBe(0);
  });
});
