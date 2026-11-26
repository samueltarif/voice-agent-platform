import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createAgentScenario,
  meetingsOfLead,
  protocolPhase,
  SchedulingHarness,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';
import {
  createSchedulingLockProbe,
  type SchedulingLockProbe,
} from './test-support/scheduling-lock-probe.js';
import { advanceSession } from './test-support/scheduling-session-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-agent-concurrency');

/**
 * E2 PR 2 (DEC-075, A4) — atomicidade, concorrência e reconciliação da
 * reserva pelo agente. Esperas provocadas por uma conexão independente que
 * segura uma trava real (`pg_locks`), nunca por `sleep`.
 */
describe('E2 PR2: atomic booking, concurrency and reconciliation', () => {
  let fx: DurableOutboundFixture;
  let probe: SchedulingLockProbe | null = null;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterEach(async () => {
    await probe?.close();
    probe = null;
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function authorized(calendarId?: string) {
    clock.set(SCHEDULING_TEST_NOW);
    const scenario = await createAgentScenario(tdb.db, {
      fx,
      ...(calendarId ? { calendarId } : {}),
    });
    const harness = new SchedulingHarness(service, scenario.scope);
    const reached = await harness.reachAuthorization();
    return { ...scenario, harness, ...reached };
  }

  /** Espera a fila: a 1ª sessão bloqueada pela sonda e a 2ª atrás da 1ª (trava de tupla ou K). */
  async function waitForQueueOfTwo(held: SchedulingLockProbe) {
    const [first] = await held.waitForSessionsBlockedBy(held.pid, 1);
    await held.waitForSessionsBlockedBy(first!, 1);
  }

  /** Segura a linha do lead (L) numa conexão independente. */
  async function holdLead(leadId: string) {
    probe = await createSchedulingLockProbe(tdb.url);
    await probe.holdInTransaction('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
    return probe;
  }

  it('two sessions confirming the same slot: exactly one meeting, the other is not announced', async () => {
    const a = await authorized();
    const b = await authorized(a.calendarId!);
    probe = await createSchedulingLockProbe(tdb.url);
    await probe.holdInTransaction('SELECT id FROM scheduling_calendars WHERE id = $1 FOR UPDATE', [
      a.calendarId,
    ]);
    const pending = Promise.all([service.confirmOffer(a.scope), service.confirmOffer(b.scope)]);
    await waitForQueueOfTwo(probe);
    await probe.commit();
    const results = await pending;
    expect(results.map((result) => result.status).sort()).toEqual(['BOOKED', 'NOT_BOOKED']);
    expect(results.find((result) => result.status === 'NOT_BOOKED')).toMatchObject({
      outcome: 'SLOT_UNAVAILABLE',
      mayAnnounceBooking: false,
    });
    const total =
      (await meetingsOfLead(tdb.db, a.scope.organizationId, a.leadId)).length +
      (await meetingsOfLead(tdb.db, b.scope.organizationId, b.leadId)).length;
    expect(total).toBe(1);
  });

  it('the same authorization confirmed concurrently books once; the repeat is a recovery', async () => {
    const { scope, leadId } = await authorized();
    const held = await holdLead(leadId);
    const pending = Promise.all([service.confirmOffer(scope), service.confirmOffer(scope)]);
    await waitForQueueOfTwo(held);
    await held.commit();
    const results = await pending;
    expect(results.map((result) => result.status)).toEqual(['BOOKED', 'BOOKED']);
    expect(
      results.map((result) => (result.status === 'BOOKED' ? result.recovered : null)).sort(),
    ).toEqual([false, true]);
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
  });

  it('a session closed while the booking waits for its locks never gets a meeting', async () => {
    const { scope, leadId } = await authorized();
    const held = await holdLead(leadId);
    const pending = service.confirmOffer(scope);
    await held.waitForSessionsBlockedBy(held.pid, 1);
    await advanceSession(new DrizzleCallSessionRepository(tdb.db), scope, 'ENDED');
    await held.commit();
    expect(await pending).toMatchObject({ status: 'REFUSED', reason: 'SESSION_NOT_ACTIVE' });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('CLOSED');
  });

  it('a canonical suppression committed during the booking wins; nothing is announced', async () => {
    const { scope, leadId, phone } = await authorized();
    const held = await holdLead(leadId);
    const pending = service.confirmOffer(scope);
    await held.waitForSessionsBlockedBy(held.pid, 1);
    await new DrizzleContactSuppressionRepository(tdb.db).addSuppression({
      organizationId: scope.organizationId,
      phoneE164: phone,
      reason: 'OPT_OUT',
    });
    await held.commit();
    expect(await pending).toMatchObject({
      status: 'NOT_BOOKED',
      outcome: 'NOT_BOOKABLE',
      mayAnnounceBooking: false,
    });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('IDLE');
  });

  it('a failure inside the transaction rolls back meeting and consumption together', async () => {
    const { scope, leadId } = await authorized();
    const failing = new DrizzleSchedulingAgentService(tdb.db, {
      clock: clock.now,
      testHooks: {
        beforeSessionLock: async () => {
          throw new Error('injected failure between the attempt and the session locks');
        },
      },
    });
    expect(await failing.confirmOffer(scope)).toMatchObject({
      status: 'NOT_BOOKED',
      outcome: 'TECHNICAL_FAILURE',
      mayAnnounceBooking: false,
    });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('AUTHORIZED');
    // A autorização não foi gasta: a repetição reserva exatamente uma vez.
    expect(await service.confirmOffer(scope)).toMatchObject({ status: 'BOOKED', recovered: false });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
  });

  it('a failure after the business writes but before commit is UNKNOWN and reconciles to one booking', async () => {
    const { scope, leadId } = await authorized();
    let calls = 0;
    const flakyClock = () => {
      calls += 1;
      // A guarda temporal final é a última leitura do relógio dentro da transação.
      if (calls === 4) throw new Error('injected failure at the final guard');
      return clock.now();
    };
    const failing = new DrizzleSchedulingAgentService(tdb.db, { clock: flakyClock });
    const unknown = await failing.confirmOffer(scope);
    expect(unknown).toMatchObject({ status: 'UNKNOWN', mayAnnounceBooking: false });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('AUTHORIZED');
    expect(await service.confirmOffer(scope)).toMatchObject({ status: 'BOOKED', recovered: false });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
  });

  it('a response lost after commit is UNKNOWN; the next call recovers the same meeting', async () => {
    const { scope, leadId } = await authorized();
    const lossy = new DrizzleSchedulingAgentService(tdb.db, {
      clock: clock.now,
      testHooks: {
        afterCommit: async () => {
          throw new Error('injected loss of the response after commit');
        },
      },
    });
    expect(await lossy.confirmOffer(scope)).toMatchObject({
      status: 'UNKNOWN',
      mayAnnounceBooking: false,
    });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
    expect(await service.confirmOffer(scope)).toMatchObject({ status: 'BOOKED', recovered: true });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
  });

  it('isolation: another tenant, agent version or grant calendar never reaches the session', async () => {
    const { scope, leadId } = await authorized();
    const otherTenant = { ...scope, organizationId: fx.tenantB.organizationId };
    const otherVersion = { ...scope, agentVersionId: fx.tenantA.agentVersionId };
    for (const forged of [otherTenant, otherVersion]) {
      expect(await service.confirmOffer(forged)).toMatchObject({ reason: 'CONTEXT_REFUSED' });
      expect(await service.findSlots(forged, {})).toMatchObject({ reason: 'CONTEXT_REFUSED' });
      expect((await service.recordLeadUtterance(forged, 'Me descadastre.')).refusal).toBe(
        'CONTEXT_REFUSED',
      );
    }
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('AUTHORIZED');
  });
});
