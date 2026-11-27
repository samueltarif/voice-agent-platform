import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  claimAttempt,
  closeAttempt,
  markE2AgentVersion,
  nextClaim,
  prepareAttemptTo,
  stateOf,
} from './test-support/post-call-audit-support.js';
import { bookingTimeline, SILENT_TIMELINE } from './test-support/post-call-timelines.js';
import {
  createAgentScenario,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-audit184-barrier');

/**
 * Auditoria Codex da PR #184 — A3, A5, A7, M1 e M2: o que libera ou mantém a
 * barreira de discagem, com o estado conjunto (reunião, intenção, motivo,
 * supressão, histórico comercial, próximo claim).
 */
describe('audit #184: incomplete history, destination occupancy, outcomes, review and replay', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });
  const later = () => new Date(SCHEDULING_TEST_NOW.getTime() + 60 * 60_000);

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup() {
    clock.set(SCHEDULING_TEST_NOW);
    const s = await createAgentScenario(tdb.db, { fx });
    const ids = { organizationId: s.scope.organizationId, attemptId: s.attemptId };
    return {
      ...s,
      key: { organizationId: s.scope.organizationId, sessionId: s.sessionId },
      attempt: await postCallAttemptOf(tdb.db, s),
      state: () => stateOf(tdb.db, s),
      endCall: () => closeAttempt(tdb.db, ids),
    };
  }

  it('A3: an incomplete history keeps the barrier; a preserved opt-out is still applied', async () => {
    const lost = await setup();
    await service.openReconciliation(lost.scope);
    await lost.endCall();
    const incomplete = postCallReport(SILENT_TIMELINE, { integrity: 'INCOMPLETE' });
    expect(await reports.ingest(lost.attempt, incomplete)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['HISTORY_INCOMPLETE'],
    });
    expect(await lost.state()).toEqual({
      meetings: 0,
      intents: [],
      reconciliation: { status: 'NEEDS_REVIEW', reasons: ['HISTORY_INCOMPLETE'] },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
    const kept = await setup();
    await service.openReconciliation(kept.scope);
    await kept.endCall();
    const timeline = [...SILENT_TIMELINE, { kind: 'LEAD' as const, text: 'Não me ligue mais.' }];
    await reports.ingest(kept.attempt, postCallReport(timeline, { integrity: 'INCOMPLETE' }));
    expect(await kept.state()).toMatchObject({
      reconciliation: { status: 'NEEDS_REVIEW', reasons: ['HISTORY_INCOMPLETE'] },
      suppressions: 1,
      commercial: ['CREATED:NEW', 'OPT_OUT:DO_NOT_CALL'],
      nextClaim: 'JOB_REFUSED_SUPPRESSED',
    });
  });

  it('A5: two campaigns claiming the same phone at once — at most one CLAIMED', async () => {
    const e2 = await setup(); // agente com as ferramentas da E2
    await markE2AgentVersion(tdb.db, e2.tenant);
    const tenant = e2.tenant;
    const phone = `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    for (let round = 0; round < 3; round += 1) {
      const scopes = await Promise.all(
        [1, 2].map(() => prepareAttemptTo(tdb.db, { tenant, phone })),
      );
      const claims = await Promise.all(scopes.map((scope) => claimAttempt(tdb.db, scope)));
      const kinds = claims.map((c) => (c.kind === 'CLAIMED' ? 'CLAIMED' : c.reason)).sort();
      expect(kinds).toEqual(['CLAIMED', 'DESTINATION_IN_FLIGHT']);
      // Falha de originação libera o destino para a rodada seguinte.
      const won = claims.findIndex((c) => c.kind === 'CLAIMED');
      const attempts = new DrizzleCallAttemptRepository(tdb.db);
      const rejected = await attempts.completeOrigination({
        ...scopes[won]!,
        fence: (claims[won] as Extract<(typeof claims)[number], { kind: 'CLAIMED' }>).fence,
        result: { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' },
        eventId: randomUUID(),
        now: SCHEDULING_TEST_NOW,
      });
      expect(rejected.kind).toBe('APPLIED');
    }
    // Desfecho incerto (recuperação) continua ocupando o destino.
    const uncertain = await prepareAttemptTo(tdb.db, { tenant, phone });
    const claim = await claimAttempt(tdb.db, uncertain);
    if (claim.kind !== 'CLAIMED') throw new Error(claim.reason);
    await new DrizzleCallAttemptRepository(tdb.db).completeOrigination({
      ...uncertain,
      fence: claim.fence,
      result: { kind: 'UNKNOWN', reasonCode: 'TIMEOUT' },
      eventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    expect(await nextClaim(tdb.db, { tenant, phone })).toBe('DESTINATION_IN_FLIGHT');
  });

  it('A5: a closed E2 session without reconciliation still holds the phone until review', async () => {
    const s = await setup();
    await markE2AgentVersion(tdb.db, s.tenant);
    expect(await nextClaim(tdb.db, s)).toBe('DESTINATION_IN_FLIGHT'); // chamada em curso
    await s.endCall(); // a composição nunca abriu a reconciliação
    expect(await nextClaim(tdb.db, s)).toBe('POST_CALL_RECONCILIATION_PENDING');
    clock.set(later());
    await reports.expireOverdue({ olderThanMinutes: 30 });
    expect((await s.state()).reconciliation).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['REPORT_MISSING'],
    });
    expect(await reports.resolveReview({ ...s.key, userId: fx.userId })).toBe('RESOLVED');
    expect(await nextClaim(tdb.db, s)).toBe('CLAIMED');
  });

  it('A5: agents without E2 tools keep the legacy behaviour (no regression)', async () => {
    const s = await setup();
    expect(await nextClaim(tdb.db, s)).toBe('CLAIMED'); // em curso, mas sem reconciliação pós-chamada
    await s.endCall();
    expect(await nextClaim(tdb.db, s)).toBe('CLAIMED');
  });

  it('A7: a proposed NOT_INTERESTED/QUALIFIED needs evidence; "Alô?" + timeout only reaches review', async () => {
    for (const outcome of ['NOT_INTERESTED', 'QUALIFIED'] as const) {
      const s = await setup();
      expect((await service.recordOutcome(s.scope, { outcome })).status).toBe('PROPOSED');
      await s.endCall();
      const hello = [{ kind: 'LEAD' as const, text: 'Alô?' }, ...SILENT_TIMELINE];
      const report = postCallReport(hello, { endReason: 'TIMEOUT_UNSPECIFIED' });
      expect(await reports.ingest(s.attempt, report)).toEqual({
        status: 'NEEDS_REVIEW',
        reasons: [`OUTCOME_NEEDS_EVIDENCE:${outcome}`],
      });
      expect(await s.state()).toEqual({
        meetings: 0,
        intents: [],
        reconciliation: { status: 'NEEDS_REVIEW', reasons: [`OUTCOME_NEEDS_EVIDENCE:${outcome}`] },
        suppressions: 0,
        commercial: ['CREATED:NEW'],
        nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
      });
    }
  });

  it('A7: a possible opt-out suspends any outcome, CONTACTED included', async () => {
    const s = await setup();
    await service.recordOutcome(s.scope, { outcome: 'CONTACTED' });
    await s.endCall();
    const mention = {
      kind: 'LEAD' as const,
      text: 'Se eu mudar de ideia, vou pedir para tirar meu número.',
    };
    const result = await reports.ingest(s.attempt, postCallReport([mention]));
    expect(result).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['OPT_OUT_MENTION_UNCLEAR', 'OUTCOME_SUSPENDED'],
    });
    expect((await s.state()).commercial).toEqual(['CREATED:NEW']);
  });

  it('M1: a report recorded while the expiry waits on the lock is not marked as interrupted', async () => {
    const s = await setup();
    await service.openReconciliation(s.scope);
    clock.set(later());
    let expiry: Promise<number> | null = null;
    await tdb.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM post_call_reconciliations
        WHERE organization_id = ${s.key.organizationId} AND session_id = ${s.key.sessionId} FOR UPDATE`);
      expiry = reports.expireOverdue({ olderThanMinutes: 30 });
      await waitForLockWaiter();
      // Pausa determinística: o relatório é registrado enquanto a expiração espera a trava.
      await tx.execute(sql`UPDATE post_call_reconciliations SET report_digest = 'recorded',
        report_received_at = ${later()} WHERE organization_id = ${s.key.organizationId}
        AND session_id = ${s.key.sessionId}`);
    });
    expect(await expiry!).toBe(0);
    expect((await s.state()).reconciliation).toEqual({ status: 'AWAITING_REPORT', reasons: [] });
  });

  it('M1: a reconciliation still awaiting its report cannot be resolved by a human', async () => {
    const s = await setup();
    await service.openReconciliation(s.scope);
    await s.endCall();
    expect(await reports.resolveReview({ ...s.key, userId: fx.userId })).toBe('NOT_IN_REVIEW');
    expect(await s.state()).toMatchObject({
      reconciliation: { status: 'AWAITING_REPORT', reasons: [] },
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('M2: re-delivering a conflict already decided by a human keeps the decision', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    await s.endCall();
    const a = postCallReport(bookingTimeline({ listRevision }));
    const b = postCallReport(bookingTimeline({ listRevision, reply: 'Não.' }));
    expect((await reports.ingest(s.attempt, a)).status).toBe('RECONCILED');
    expect((await reports.ingest(s.attempt, b)).reasons).toEqual(['REPORT_CONFLICT']);
    expect(await reports.resolveReview({ ...s.key, userId: fx.userId })).toBe('RESOLVED');
    expect(await reports.ingest(s.attempt, b)).toEqual({
      status: 'DUPLICATE',
      reasons: ['CONFLICT_ALREADY_DECIDED'],
    });
    expect(await s.state()).toMatchObject({
      meetings: 1,
      reconciliation: { status: 'RECONCILED', reasons: ['REPORT_CONFLICT'] },
      nextClaim: 'CLAIMED',
    });
    const c = postCallReport(bookingTimeline({ listRevision, reply: 'Talvez.' }));
    expect((await reports.ingest(s.attempt, c)).reasons).toEqual(['REPORT_CONFLICT']);
  });

  async function waitForLockWaiter() {
    for (let i = 0; i < 100; i += 1) {
      const result = await tdb.db.execute(
        sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
      );
      if ((result.rows[0] as { n: number }).n > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('expiry never waited on the lock');
  }
});
