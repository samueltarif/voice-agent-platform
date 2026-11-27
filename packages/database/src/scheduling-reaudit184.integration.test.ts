import { randomUUID } from 'node:crypto';
import { canonicalReadback, type PostCallEntry } from '@voice-agent/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { buildInternalAttemptEvent } from './repositories/durable-attempt-event-factory.js';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { postCallReconciliations } from './schema/post-call-reconciliations.js';
import { recordReport } from './repositories/post-call-record.js';
import { findSlots } from './repositories/scheduling-agent-offers.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { DrizzleSchedulingSessionContextResolver } from './repositories/scheduling-session-context-resolver.js';
import { DrizzleSchedulingSlotRepository } from './repositories/scheduling-slot-repository.js';
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
  intentsOf,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-reaudit184');

/**
 * Reauditoria Codex da PR #184 (HEAD `1761eeb`) — cenários concretos do
 * relatório e as causas estruturais: aceite só pela pergunta canônica (A1),
 * integridade por fala (A3), barreira num único retrato e tentativa sem sessão
 * (A5), recuperação sem reentrega (A4), opt-out de relatório tardio, resposta
 * fiel ao estado (A2) e selo em todas as transações de `find_slots` (A6).
 */
describe('re-audit #184: structural fixes', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });
  const later = () => new Date(SCHEDULING_TEST_NOW.getTime() + 60 * 60_000);
  const OPT_OUT: PostCallEntry = { kind: 'LEAD', text: 'Não me ligue mais.' };

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

  it('A1: only the canonical question returned by find_slots supports an acceptance', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    const { confirmationQuestion } = found.options[0]!;
    expect(confirmationQuestion).toBe(
      canonicalReadback('2026-11-30T12:00:00.000Z', 'America/Sao_Paulo'),
    );
    for (const readback of [
      'Posso ligar para você segunda às 9h?',
      'Confirma segunda às 9 da noite?',
      `${confirmationQuestion} Ou prefere terça?`,
    ]) {
      const t = await setup();
      const { listRevision } = await offerAndRequest(service, t.scope);
      await t.endCall();
      const report = postCallReport(bookingTimeline({ listRevision, readback, reply: 'Sim.' }));
      expect(await reports.ingest(t.attempt, report)).toEqual({
        status: 'NEEDS_REVIEW',
        reasons: ['BOOKING_READBACK_NOT_EVIDENT'],
      });
      expect([readback, (await t.state()).meetings]).toEqual([readback, 0]);
    }
    // Controle positivo: a pergunta canônica (rótulo com fuso e GMT-03:00) reserva.
    const ok = await setup();
    const { listRevision } = await offerAndRequest(service, ok.scope);
    await ok.endCall();
    const report = postCallReport(
      bookingTimeline({ listRevision, readback: confirmationQuestion }),
    );
    expect((await reports.ingest(ok.attempt, report)).status).toBe('RECONCILED');
    expect((await ok.state()).meetings).toBe(1);
  });

  it('A3: a truncated opt-out never suppresses; it keeps the review and the barrier', async () => {
    const s = await setup();
    await service.openReconciliation(s.scope);
    await s.endCall();
    const cut: PostCallEntry = { kind: 'LEAD', text: 'Não me ligue mais', truncated: true };
    const report = postCallReport([...SILENT_TIMELINE, cut], { integrity: 'INCOMPLETE' });
    expect(await reports.ingest(s.attempt, report)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['OPT_OUT_MENTION_UNCLEAR', 'HISTORY_INCOMPLETE'],
    });
    expect(await s.state()).toEqual({
      meetings: 0,
      intents: [],
      reconciliation: {
        status: 'NEEDS_REVIEW',
        reasons: ['OPT_OUT_MENTION_UNCLEAR', 'HISTORY_INCOMPLETE'],
      },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('A5: mixed versions — E2 then legacy and legacy then E2 — never dial in parallel', async () => {
    const e2 = await setup();
    await markE2AgentVersion(tdb.db, e2.tenant);
    const legacy = await setup(); // outro agente do mesmo tenant, sem ferramentas da E2
    for (const [first, second] of [
      [e2.tenant, legacy.tenant],
      [legacy.tenant, e2.tenant],
    ] as const) {
      const phone = `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const claim = await claimAttempt(
        tdb.db,
        await prepareAttemptTo(tdb.db, { tenant: first, phone }),
      );
      expect(claim.kind).toBe('CLAIMED');
      expect(await nextClaim(tdb.db, { tenant: second, phone })).toBe('DESTINATION_IN_FLIGHT');
    }
  });

  it('A5: adopting the orphan concurrently with a claim never lets the claim through', async () => {
    const s = await setup();
    await markE2AgentVersion(tdb.db, s.tenant);
    await s.endCall(); // sessão E2 encerrada, sem reconciliação
    // Pausa determinística: a adoção insere a linha e só confirma depois do claim.
    await tdb.db.transaction(async (tx) => {
      await tx.insert(postCallReconciliations).values({
        organizationId: s.key.organizationId,
        attemptId: s.attemptId,
        sessionId: s.sessionId,
        phoneE164: s.phone,
        createdAt: SCHEDULING_TEST_NOW,
        updatedAt: SCHEDULING_TEST_NOW,
      });
      expect(await nextClaim(tdb.db, s)).toBe('POST_CALL_RECONCILIATION_PENDING');
    });
    expect(await nextClaim(tdb.db, s)).toBe('POST_CALL_RECONCILIATION_PENDING');
    // E em corrida real com a rotina de adoção, várias rodadas.
    for (let round = 0; round < 3; round += 1) {
      const t = await setup();
      await markE2AgentVersion(tdb.db, t.tenant);
      await t.endCall();
      clock.set(later());
      const [, claimed] = await Promise.all([
        reports.expireOverdue({ olderThanMinutes: 30 }),
        nextClaim(tdb.db, t),
      ]);
      expect(claimed).toBe('POST_CALL_RECONCILIATION_PENDING');
    }
  });

  it('A5: an E2 call confirmed closed WITHOUT a bound session holds the phone in a resolvable review', async () => {
    const s = await setup();
    await markE2AgentVersion(tdb.db, s.tenant);
    const phone = `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const scope = await prepareAttemptTo(tdb.db, { tenant: s.tenant, phone });
    const claim = await claimAttempt(tdb.db, scope);
    if (claim.kind !== 'CLAIMED') throw new Error(claim.reason);
    const attempts = new DrizzleCallAttemptRepository(tdb.db);
    const accepted = buildInternalAttemptEvent({
      attempt: claim.record.attempt,
      type: 'ORIGINATION_ACCEPTED',
      eventId: randomUUID(),
      now: SCHEDULING_TEST_NOW,
    });
    await attempts.applyEvent({
      ...scope,
      event: accepted,
      now: SCHEDULING_TEST_NOW,
      fence: claim.fence,
    });
    await closeAttempt(tdb.db, scope); // encerramento confirmado, sem `callSessionId`
    const tenant = s.tenant;
    expect(await nextClaim(tdb.db, { tenant, phone })).toBe('POST_CALL_RECONCILIATION_PENDING');
    clock.set(later());
    await reports.expireOverdue({ olderThanMinutes: 30 });
    const resolution = { organizationId: scope.organizationId, attemptId: scope.attemptId };
    expect(await reports.resolveReview({ ...resolution, userId: fx.userId })).toBe('RESOLVED');
    expect(await nextClaim(tdb.db, { tenant, phone })).toBe('CLAIMED');
  });

  it('A4: a crash between the conflict commit and the intent hold recovers in the human review, without re-delivery', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    await s.endCall();
    const a = postCallReport(bookingTimeline({ listRevision, reply: 'Talvez.' }));
    expect((await reports.ingest(s.attempt, a)).status).toBe('NEEDS_REVIEW');
    // Só a 1ª transação do conflito (sem a retenção da intenção): a "queda".
    const t = await setup();
    const second = await offerAndRequest(service, t.scope);
    await t.endCall();
    const ta = postCallReport(bookingTimeline({ listRevision: second.listRevision }));
    const tb = postCallReport(
      bookingTimeline({ listRevision: second.listRevision, reply: 'Não.' }),
    );
    const first = await recordReport(tdb.db, { attempt: t.attempt, report: ta, now: clock.now() });
    expect(first.kind).toBe('PROCESS');
    const conflict = await recordReport(tdb.db, {
      attempt: t.attempt,
      report: tb,
      now: clock.now(),
    });
    expect(conflict).toMatchObject({ kind: 'STOP', reason: 'REPORT_CONFLICT' });
    expect((await intentsOf(tdb.db, t.scope))[0]?.status).toBe('PENDING_EVIDENCE');
    expect(await reports.resolveReview({ ...t.key, userId: fx.userId })).toBe('RESOLVED');
    expect(await t.state()).toEqual({
      meetings: 0,
      intents: ['CANCELED:REVIEW_RESOLVED'],
      reconciliation: { status: 'RECONCILED', reasons: ['REPORT_CONFLICT'] },
      suppressions: 0,
      commercial: ['CREATED:NEW'],
      nextClaim: 'CLAIMED',
    });
  });

  it('A4: re-delivering the original report also recovers the hold', async () => {
    const t = await setup();
    const { listRevision } = await offerAndRequest(service, t.scope);
    await t.endCall();
    const ta = postCallReport(bookingTimeline({ listRevision }));
    const tb = postCallReport(bookingTimeline({ listRevision, reply: 'Não.' }));
    await recordReport(tdb.db, { attempt: t.attempt, report: ta, now: clock.now() });
    await recordReport(tdb.db, { attempt: t.attempt, report: tb, now: clock.now() });
    // Reentrega de A depois do conflito: duplicada (sem efeito), mas retém a intenção.
    expect(await reports.ingest(t.attempt, ta)).toEqual({
      status: 'DUPLICATE',
      reasons: ['NEEDS_REVIEW'],
    });
    expect(await t.state()).toMatchObject({
      meetings: 0,
      intents: ['NEEDS_REVIEW:REVIEW_PENDING'],
      nextClaim: 'POST_CALL_RECONCILIATION_PENDING',
    });
  });

  it('late report: after a human resolved the missing report, an explicit opt-out is still applied', async () => {
    const s = await setup();
    await offerAndRequest(service, s.scope);
    await s.endCall();
    clock.set(later());
    await reports.expireOverdue({ olderThanMinutes: 30 });
    expect(await reports.resolveReview({ ...s.key, userId: fx.userId })).toBe('RESOLVED');
    const late = postCallReport([...SILENT_TIMELINE, OPT_OUT]);
    expect(await reports.ingest(s.attempt, late)).toEqual({
      status: 'NEEDS_REVIEW',
      reasons: ['REPORT_AFTER_RESOLUTION'],
    });
    expect(await s.state()).toMatchObject({
      meetings: 0,
      intents: ['NEEDS_REVIEW:REPORT_MISSING'],
      reconciliation: {
        status: 'NEEDS_REVIEW',
        reasons: ['REPORT_MISSING', 'REPORT_AFTER_RESOLUTION'],
      },
      suppressions: 1,
      commercial: ['CREATED:NEW', 'OPT_OUT:DO_NOT_CALL'],
      nextClaim: 'JOB_REFUSED_SUPPRESSED',
    });
    // Idempotente: a reentrega não duplica nada.
    await reports.ingest(s.attempt, late);
    expect((await s.state()).suppressions).toBe(1);
  });

  it('late report: a conflicting report with an explicit opt-out also suppresses (decisions kept)', async () => {
    const s = await setup();
    const { listRevision } = await offerAndRequest(service, s.scope);
    await s.endCall();
    await reports.ingest(s.attempt, postCallReport(bookingTimeline({ listRevision })));
    const conflicting = postCallReport(bookingTimeline({ listRevision, after: [OPT_OUT] }));
    expect((await reports.ingest(s.attempt, conflicting)).reasons).toEqual(['REPORT_CONFLICT']);
    expect(await s.state()).toMatchObject({
      meetings: 1,
      intents: ['BOOKED:LEAD_AFFIRMED_READBACK'],
      suppressions: 1,
    });
  });

  it('A6: a report closing between the pre-gate and the list publication is honoured', async () => {
    const s = await setup();
    await offerAndRequest(service, s.scope);
    const real = new DrizzleSchedulingSlotRepository(tdb.db);
    const report = postCallReport(SILENT_TIMELINE);
    const paused = {
      offerSlots: async (input: Parameters<typeof real.offerSlots>[0]) => {
        const result = await real.offerSlots(input);
        await reports.ingest(s.attempt, report); // pausa determinística entre as transações
        return result;
      },
    } as unknown as DrizzleSchedulingSlotRepository;
    const deps = {
      db: tdb.db,
      clock: clock.now,
      resolver: new DrizzleSchedulingSessionContextResolver(tdb.db),
      slots: paused,
    };
    expect(await findSlots(deps, s.scope, { day: '2026-12-01' })).toMatchObject({
      status: 'REFUSED',
      reason: 'SESSION_NOT_ACTIVE',
    });
  });
});
