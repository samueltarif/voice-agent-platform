import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallEventTrailRepository } from './repositories/call-event-trail-repository.js';
import { DurableOutboundOriginationRunner } from './repositories/durable-outbound-origination-runner.js';
import {
  LOCAL_TEST_DATABASE_URL,
  assertLocalDatabaseUrl,
  countDurableOutboundLeftovers,
  createDurableOutboundFixture,
  createExtraJob,
  destroyDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  killLiveCrashChildren,
  runDurableCrashChild,
} from './test-support/spawn-durable-crash-child.js';

assertLocalDatabaseUrl(LOCAL_TEST_DATABASE_URL);

const T0 = '2026-10-20T12:00:00.000Z';
const AFTER_LEASE = '2026-10-20T12:10:00.000Z';

/**
 * Crash REAL: cada cenário roda em um processo Node separado que morre por
 * SIGKILL; a verificação e a recuperação acontecem em OUTROS processos/pools,
 * sem nenhuma memória compartilhada com o processo que caiu.
 */
describe('008-OF2 crash recovery with separate Node processes', { timeout: 120_000 }, () => {
  const { db, pool } = createDatabaseConnection({ connectionString: LOCAL_TEST_DATABASE_URL });
  const attempts = new DrizzleCallAttemptRepository(db);
  const trail = new DrizzleCallEventTrailRepository(db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
  });

  afterAll(async () => {
    killLiveCrashChildren();
    try {
      await destroyDurableOutboundFixture(db, fx);
      expect(await countDurableOutboundLeftovers(db, fx)).toBe(0);
    } finally {
      await pool.end();
    }
  });

  async function scenario(mode: string, extra: Record<string, unknown> = {}) {
    const jobId =
      (extra.jobId as string | undefined) ??
      (await createExtraJob(db, { tenant: fx.tenantA, tag: mode }));
    const attemptId = (extra.attemptId as string | undefined) ?? randomUUID();
    const run = await runDurableCrashChild({
      mode,
      organizationId: fx.tenantA.organizationId,
      agentId: fx.tenantA.agentId,
      agentVersionId: fx.tenantA.agentVersionId,
      jobId,
      attemptId,
      nowIso: T0,
      ownerId: `worker-${mode}`,
      ...extra,
    });
    return {
      run,
      jobId,
      attemptId,
      scope: { organizationId: fx.tenantA.organizationId, attemptId },
    };
  }

  const crashedAt = (lines: Record<string, unknown>[]) =>
    lines.find((l) => 'crashPoint' in l)?.crashPoint;
  const finished = (lines: Record<string, unknown>[]) => lines.some((l) => l.done === true);

  function recoverIn(ownerId: string) {
    return runDurableCrashChild({
      mode: 'recover',
      organizationId: fx.tenantA.organizationId,
      jobId: randomUUID(),
      attemptId: randomUUID(),
      agentId: fx.tenantA.agentId,
      agentVersionId: fx.tenantA.agentVersionId,
      nowIso: AFTER_LEASE,
      ownerId,
    });
  }

  it('A/B: a crash before or during the first write leaves nothing persisted', async () => {
    const a = await scenario('A');
    expect(crashedAt(a.run.lines)).toBe('A_before_any_write');
    expect(await attempts.getById(a.scope)).toBeNull();
    const b = await scenario('B');
    expect(crashedAt(b.run.lines)).toBe('B_before_intent_commit');
    expect(finished(b.run.lines)).toBe(false);
    expect(await attempts.getById(b.scope)).toBeNull();
  });

  it('C: intent recorded but never sent survives the crash and stays safely pre-send', async () => {
    const c = await scenario('C');
    expect(crashedAt(c.run.lines)).toBe('C_after_intent_before_send');
    const stored = await attempts.getById(c.scope);
    expect(stored?.attempt.state).toBe('ORIGINATION_PENDING');
    const rec = await recoverIn('recovery-C');
    const report = rec.lines.find((l) => 'report' in l)?.report as { preSendUntouched: string[] };
    expect(report.preSendUntouched).toContain(c.attemptId);
    expect((await attempts.getById(c.scope))?.attempt.state).toBe('ORIGINATION_PENDING');
  });

  it('D/E/F + H: every post-SEND_STARTED crash becomes OUTCOME_UNKNOWN; two recoverers never share work', async () => {
    const d = await scenario('D');
    const e = await scenario('E');
    const f = await scenario('F');
    expect([crashedAt(d.run.lines), crashedAt(e.run.lines), crashedAt(f.run.lines)]).toEqual([
      'D_after_send_started_before_port',
      'E_after_port_before_response_write',
      'F_accept_applied_not_committed',
    ]);
    for (const s of [d, e, f])
      expect((await attempts.getById(s.scope))?.attempt.state).toBe('ORIGINATION_SENT');

    const [r1, r2] = await Promise.all([recoverIn('recovery-1'), recoverIn('recovery-2')]);
    const recovered = [r1, r2].flatMap(
      (r) =>
        (r.lines.find((l) => 'report' in l)?.report as { recovered: { attemptId: string }[] })
          .recovered ?? [],
    );
    const ids = recovered.map((x) => x.attemptId).sort();
    expect(ids).toEqual([d.attemptId, e.attemptId, f.attemptId].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [d, e, f]) {
      const stored = await attempts.getById(s.scope);
      expect(stored?.attempt.state).toBe('OUTCOME_UNKNOWN');
      expect(stored?.attempt.providerReference).toBeNull();
      const blocked = await attempts.prepareAttempt({
        organizationId: s.scope.organizationId,
        jobId: s.jobId,
        attemptId: randomUUID(),
        correlationId: randomUUID(),
        intentEventId: randomUUID(),
        now: new Date(AFTER_LEASE),
      });
      expect(blocked).toEqual({ kind: 'BLOCKED', reason: 'OUTCOME_UNKNOWN_BLOCKS_REDIAL' });
    }
    const types = (await trail.listByAttempt(f.scope)).map((x) => x.eventType);
    expect(types).toEqual(['INTENT_RECORDED', 'SEND_STARTED', 'CRASH_RECOVERY_DETECTED']);
  });

  it('I: the original owner writing after losing ownership is fenced (from another process)', async () => {
    const i = await scenario('D');
    const before = await attempts.getById(i.scope);
    const oldFence = { ownerId: before!.claimOwner!, fencingToken: before!.fencingToken };
    await recoverIn('recovery-I');
    const late = await scenario('completeWithFence', {
      jobId: i.jobId,
      attemptId: i.attemptId,
      fence: oldFence,
    });
    expect(late.run.lines.find((l) => 'outcome' in l)?.outcome).toBe('FENCED');
    expect((await attempts.getById(i.scope))?.attempt.state).toBe('OUTCOME_UNKNOWN');
  });

  it('G: a crash during reconciliation is re-claimed only after the lease, with a new fence', async () => {
    const g = await scenario('D');
    await recoverIn('recovery-G');
    const crashRun = await scenario('G', { jobId: g.jobId, attemptId: g.attemptId });
    expect(crashedAt(crashRun.run.lines)).toBe('G_during_reconciliation');
    const pending = await attempts.getById(g.scope);
    expect(pending?.attempt.state).toBe('RECONCILIATION_PENDING');
    const tooEarly = await attempts.claimReconciliation({
      ...g.scope,
      ownerId: 'r2',
      leaseMs: 5_000,
      eventId: randomUUID(),
      now: new Date(T0),
    });
    expect(tooEarly).toEqual({ kind: 'REJECTED', reason: 'CLAIM_HELD_BY_ANOTHER_OWNER' });
    const runner = new DurableOutboundOriginationRunner({
      db,
      attempts,
      origination: {
        providerName: 'unused',
        originate: () => Promise.reject(new Error('must not dial')),
      },
      reconciliation: { reconcile: async () => ({ kind: 'CONFIRMED_NOT_ORIGINATED' }) },
      ownerId: 'r3',
      leaseMs: 5_000,
      newEventId: randomUUID,
      now: () => new Date(AFTER_LEASE),
    });
    const result = await runner.reconcile(g.scope);
    expect(result.kind === 'COMPLETED' && result.outcome.kind).toBe('APPLIED');
    const final = await attempts.getById(g.scope);
    expect(final?.attempt.state).toBe('NOT_ORIGINATED');
    expect(final!.fencingToken).toBeGreaterThan(pending!.fencingToken);
  });

  it('J: repeated restarts with OUTCOME_UNKNOWN change nothing and never redial', async () => {
    const j = await scenario('E');
    for (const owner of ['restart-1', 'restart-2', 'restart-3']) await recoverIn(owner);
    const stored = await attempts.getById(j.scope);
    expect(stored?.attempt.state).toBe('OUTCOME_UNKNOWN');
    const types = (await trail.listByAttempt(j.scope)).map((x) => x.eventType);
    expect(types.filter((t) => t === 'CRASH_RECOVERY_DETECTED')).toHaveLength(1);
    expect(types.filter((t) => t === 'SEND_STARTED')).toHaveLength(1);
  });
});
