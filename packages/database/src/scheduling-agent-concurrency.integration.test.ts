import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleOutboundRepository } from './repositories/outbound-repository.js';
import { DrizzlePostCallReconciliationService } from './repositories/post-call-reconciliation-service.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { closeAttempt } from './test-support/post-call-audit-support.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { bookingTimeline } from './test-support/post-call-timelines.js';
import {
  createAgentScenario,
  intentsOf,
  meetingsOfLead,
  offerAndRequest,
  postCallAttemptOf,
  postCallReport,
  suppressionsOf,
  type AgentScenario,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-agent-concurrency');

/**
 * E2 simplificada (DEC-077) — concorrência e barreira de discagem. Os
 * resultados valem para QUALQUER ordem de execução: o teste afirma
 * invariantes, não a ordem.
 */
describe('E2 simplified: concurrency, idempotency and the dialing barrier', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });
  const reports = new DrizzlePostCallReconciliationService(tdb.db, { clock: clock.now });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup(calendarId?: string) {
    clock.set(SCHEDULING_TEST_NOW);
    const s = await createAgentScenario(tdb.db, { fx, ...(calendarId ? { calendarId } : {}) });
    return { ...s, attempt: await postCallAttemptOf(tdb.db, s) };
  }

  const meetings = (s: AgentScenario) => meetingsOfLead(tdb.db, s.scope.organizationId, s.leadId);
  const accepted = async (s: AgentScenario) => {
    const { listRevision } = await offerAndRequest(service, s.scope);
    return postCallReport(bookingTimeline({ listRevision }));
  };

  it('two leads accepting the same slot: exactly one meeting, the other goes to review', async () => {
    const a = await setup();
    const b = await setup(a.calendarId!);
    const [reportA, reportB] = [await accepted(a), await accepted(b)];
    const results = await Promise.all([
      reports.ingest(a.attempt, reportA),
      reports.ingest(b.attempt, reportB),
    ]);
    const total = (await meetings(a)).length + (await meetings(b)).length;
    expect(total).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(['NEEDS_REVIEW', 'RECONCILED']);
  });

  it('the same report delivered concurrently books once', async () => {
    const s = await setup();
    const report = await accepted(s);
    await Promise.all([reports.ingest(s.attempt, report), reports.ingest(s.attempt, report)]);
    expect(await meetings(s)).toHaveLength(1);
    expect((await intentsOf(tdb.db, s.scope))[0]?.status).toBe('BOOKED');
  });

  it('opt-out racing a booking request: never a pending intent next to a recorded opt-out', async () => {
    const s = await setup();
    const found = await service.findSlots(s.scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    await Promise.all([
      service.requestBooking(s.scope, {
        listRevision: found.listRevision,
        option: 1,
        leadConfirmation: 'Sim.',
      }),
      service.recordOptOut(s.scope, { leadPhrase: 'Não me ligue mais.' }),
    ]);
    const statuses = (await intentsOf(tdb.db, s.scope)).map((intent) => intent.status);
    expect(statuses).not.toContain('PENDING_EVIDENCE');
    expect(await suppressionsOf(tdb.db, s.scope.organizationId, s.phone)).toBe(1);
  });

  it('opt-out racing the post-call booking: the phone ends suppressed either way', async () => {
    const s = await setup();
    const report = await accepted(s);
    await Promise.all([reports.ingest(s.attempt, report), service.recordOptOut(s.scope, {})]);
    expect(await suppressionsOf(tdb.db, s.scope.organizationId, s.phone)).toBe(1);
    const [intent] = await intentsOf(tdb.db, s.scope);
    expect(['BOOKED', 'CANCELED']).toContain(intent!.status);
    expect((await meetings(s)).length).toBe(intent!.status === 'BOOKED' ? 1 : 0);
  });

  it('no new attempt to the same phone is sent while the reconciliation is open', async () => {
    const s = await setup();
    const report = await accepted(s);
    const claimAgain = async () => {
      const outbound = new DrizzleOutboundRepository(tdb.db);
      const attempts = new DrizzleCallAttemptRepository(tdb.db);
      const org = s.scope.organizationId;
      const job = await outbound.createJob({
        organizationId: org,
        agentId: s.tenant.agentId,
        agentVersionId: s.tenant.agentVersionId,
        destinationPhone: s.phone,
        idempotencyKey: `e2-barrier-${randomUUID()}`,
        maxAttempts: 1,
      });
      const scope = { organizationId: org, attemptId: randomUUID(), jobId: job.id };
      const now = SCHEDULING_TEST_NOW;
      await attempts.prepareAttempt({
        ...scope,
        correlationId: randomUUID(),
        intentEventId: randomUUID(),
        now,
      });
      return attempts.claimSend({
        ...scope,
        ownerId: 'barrier',
        leaseMs: 60_000,
        eventId: randomUUID(),
        now,
      });
    };
    expect(await claimAgain()).toMatchObject({
      kind: 'REJECTED',
      reason: 'POST_CALL_RECONCILIATION_PENDING',
    });
    expect((await reports.ingest(s.attempt, report)).status).toBe('RECONCILED');
    // Auditoria #184 A5: a tentativa anterior ainda em curso também ocupa o destino.
    expect(await claimAgain()).toMatchObject({ kind: 'REJECTED', reason: 'DESTINATION_IN_FLIGHT' });
    await closeAttempt(tdb.db, { organizationId: s.scope.organizationId, attemptId: s.attemptId });
    expect((await claimAgain()).kind).toBe('CLAIMED');
  });
});
