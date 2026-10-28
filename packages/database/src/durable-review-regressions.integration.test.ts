import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallEventTrailRepository } from './repositories/call-event-trail-repository.js';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { buildInternalAttemptEvent } from './repositories/durable-attempt-event-factory.js';
import { classifyPostgresFailure } from './repositories/outbound-persistence-errors.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
  type TenantFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

async function failureOf(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    return classifyPostgresFailure(error);
  }
  return null;
}

/**
 * Banco criado no carregamento do módulo, como nas demais suítes descartáveis:
 * criação + migrations não ficam sujeitas ao limite de hook de 10 s e, se
 * falharem, o próprio harness remove a base e propaga a causa original; o
 * `afterAll` só existe quando a criação terminou (nunca com `tdb` indefinido).
 */
const tdb = await createDisposableTestDatabase('review');

/** Regressões da revisão independente da PR #121 (P0-1, P0-2, P0-3). */
describe('PR #121 review regressions (PostgreSQL)', () => {
  let attempts: DrizzleCallAttemptRepository;
  let sessions: DrizzleCallSessionRepository;
  let trail: DrizzleCallEventTrailRepository;
  let fx: DurableOutboundFixture;
  const now = new Date('2026-10-20T12:00:00.000Z');

  beforeAll(async () => {
    attempts = new DrizzleCallAttemptRepository(tdb.db);
    sessions = new DrizzleCallSessionRepository(tdb.db);
    trail = new DrizzleCallEventTrailRepository(tdb.db);
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await tdb.drop();
  });

  async function sentAttempt(tenant: TenantFixture) {
    const jobId = await createExtraJob(tdb.db, { tenant, tag: 'review' });
    const prepared = await attempts.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now,
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const scope = { organizationId: tenant.organizationId, attemptId: prepared.record.attempt.id };
    const claim = await attempts.claimSend({
      ...scope,
      ownerId: 'w',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now,
    });
    if (claim.kind !== 'CLAIMED') throw new Error('expected CLAIMED');
    return { scope, claim };
  }

  describe('P0-1: the operational trail cannot be deleted', () => {
    it('blocks direct DELETE and TRUNCATE on call_events', async () => {
      const { scope } = await sentAttempt(fx.tenantA);
      const before = await trail.listByAttempt(scope);
      const del = tdb.db.execute(
        sql`DELETE FROM call_events WHERE attempt_id = ${scope.attemptId}`,
      );
      expect((await failureOf(del))?.kind).toBe('INVARIANT_GUARD');
      expect((await failureOf(tdb.db.execute(sql`TRUNCATE call_events`)))?.kind).toBe(
        'INVARIANT_GUARD',
      );
      expect(await trail.listByAttempt(scope)).toEqual(before);
      expect((await trail.rebuildAttempt(scope))?.attempt.state).toBe('ORIGINATION_SENT');
    });

    it('blocks removing the trail through parent deletes (attempt, session, organization)', async () => {
      const { scope } = await sentAttempt(fx.tenantA);
      const delAttempt = tdb.db.execute(
        sql`DELETE FROM call_attempts WHERE id = ${scope.attemptId}`,
      );
      expect(await failureOf(delAttempt)).not.toBeNull();
      const delOrg = tdb.db.execute(
        sql`DELETE FROM organizations WHERE id = ${scope.organizationId}`,
      );
      expect(await failureOf(delOrg)).not.toBeNull();
      expect((await trail.listByAttempt(scope)).length).toBe(2);

      const bound = await sentAttempt(fx.tenantA);
      const sessionId = randomUUID();
      await sessions.create({ ...bound.scope, sessionId, now });
      const accept = buildInternalAttemptEvent({
        attempt: bound.claim.record.attempt,
        type: 'ORIGINATION_ACCEPTED',
        eventId: randomUUID(),
        now,
        extra: { callSessionId: sessionId },
      });
      expect((await attempts.applyEvent({ ...bound.scope, event: accept, now })).kind).toBe(
        'APPLIED',
      );
      const delSession = tdb.db.execute(sql`DELETE FROM call_sessions WHERE id = ${sessionId}`);
      expect(await failureOf(delSession)).not.toBeNull();
      const sessionTrail = await trail.listBySession({
        organizationId: fx.tenantA.organizationId,
        sessionId,
      });
      expect(sessionTrail).toHaveLength(1);
    });
  });

  describe('P0-2: tenant correlation precedes event-id classification', () => {
    it('reusing a foreign eventId with foreign correlation is a scope rejection, with no mutation', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantB);
      const bEvent = buildInternalAttemptEvent({
        attempt: b.claim.record.attempt,
        type: 'ORIGINATION_ACCEPTED',
        eventId: randomUUID(),
        now,
      });
      expect((await attempts.applyEvent({ ...b.scope, event: bEvent, now })).kind).toBe('APPLIED');
      const beforeA = await attempts.getById(a.scope);
      const beforeB = await attempts.getById(b.scope);
      const replayAtA = await attempts.applyEvent({ ...a.scope, event: bEvent, now });
      expect(replayAtA).toMatchObject({ kind: 'REJECTED', reason: 'TENANT_MISMATCH' });
      expect(await attempts.getById(a.scope)).toEqual(beforeA);
      expect(await attempts.getById(b.scope)).toEqual(beforeB);
    });

    it('same eventId with valid correlation but different content is EVENT_ID_CONFLICT; exact replay is DUPLICATE', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantB);
      const bEvent = buildInternalAttemptEvent({
        attempt: b.claim.record.attempt,
        type: 'CALL_CLOSED_CONFIRMED',
        eventId: randomUUID(),
        now,
      });
      await attempts.applyEvent({ ...b.scope, event: bEvent, now });
      expect((await attempts.applyEvent({ ...b.scope, event: bEvent, now })).kind).toBe(
        'DUPLICATE',
      );
      const reusedAtA = buildInternalAttemptEvent({
        attempt: a.claim.record.attempt,
        type: 'CALL_CLOSED_CONFIRMED',
        eventId: bEvent.eventId as string,
        now,
      });
      expect((await attempts.applyEvent({ ...a.scope, event: reusedAtA, now })).kind).toBe(
        'EVENT_ID_CONFLICT',
      );
      expect((await attempts.getById(a.scope))?.attempt.state).toBe('ORIGINATION_SENT');
    });
  });

  describe('P0-3: an attempt can only bind the session that points back to it', () => {
    it('rejects ORIGINATION_ACCEPTED for A carrying the session of B (same tenant), atomically', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantA);
      const sessionId = randomUUID();
      expect((await sessions.create({ ...b.scope, sessionId, now })).kind).toBe('CREATED');
      const accept = buildInternalAttemptEvent({
        attempt: a.claim.record.attempt,
        type: 'ORIGINATION_ACCEPTED',
        eventId: randomUUID(),
        now,
        extra: { callSessionId: sessionId },
      });
      const result = await attempts.applyEvent({ ...a.scope, event: accept, now });
      expect(result).toMatchObject({ kind: 'REJECTED', reason: 'SESSION_MISMATCH' });
      const storedA = await attempts.getById(a.scope);
      expect(storedA?.attempt.state).toBe('ORIGINATION_SENT');
      expect(storedA?.attempt.callSessionId).toBeNull();
      expect((await trail.listByAttempt(a.scope)).map((e) => e.eventType)).toEqual([
        'INTENT_RECORDED',
        'SEND_STARTED',
      ]);
      const s = await sessions.getById({ organizationId: fx.tenantA.organizationId, sessionId });
      expect(s?.currentAttemptId).toBe(b.scope.attemptId);
    });

    it('rejects nonexistent or foreign-tenant sessions without technical errors', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantB);
      const foreignSession = randomUUID();
      await sessions.create({ ...b.scope, sessionId: foreignSession, now });
      for (const sessionId of [randomUUID(), foreignSession]) {
        const accept = buildInternalAttemptEvent({
          attempt: a.claim.record.attempt,
          type: 'ORIGINATION_ACCEPTED',
          eventId: randomUUID(),
          now,
          extra: { callSessionId: sessionId },
        });
        expect(await attempts.applyEvent({ ...a.scope, event: accept, now })).toMatchObject({
          kind: 'REJECTED',
          reason: 'SESSION_MISMATCH',
        });
      }
    });

    it('the database itself refuses a cross-bound session even via direct SQL', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantA);
      const sessionId = randomUUID();
      await sessions.create({ ...b.scope, sessionId, now });
      const direct = tdb.db.execute(sql`
        UPDATE call_attempts SET call_session_id = ${sessionId}, state_version = state_version + 1
        WHERE id = ${a.scope.attemptId}`);
      expect((await failureOf(direct))?.kind).toBe('FOREIGN_KEY_VIOLATION');
    });

    it('two concurrent binders of the same session: only the session owner attempt binds', async () => {
      const a = await sentAttempt(fx.tenantA);
      const b = await sentAttempt(fx.tenantA);
      const sessionId = randomUUID();
      await sessions.create({ ...b.scope, sessionId, now });
      const acceptFor = (x: typeof a) =>
        attempts.applyEvent({
          ...x.scope,
          event: buildInternalAttemptEvent({
            attempt: x.claim.record.attempt,
            type: 'ORIGINATION_ACCEPTED',
            eventId: randomUUID(),
            now,
            extra: { callSessionId: sessionId, providerReference: 'ref-1' },
          }),
          now,
        });
      const [ra, rb] = await Promise.all([acceptFor(a), acceptFor(b)]);
      expect(ra).toMatchObject({ kind: 'REJECTED', reason: 'SESSION_MISMATCH' });
      expect(rb.kind).toBe('APPLIED');
    });

    it('detects conflicting opaque references between session and acceptance', async () => {
      const a = await sentAttempt(fx.tenantA);
      const sessionId = randomUUID();
      await sessions.create({ ...a.scope, sessionId, providerCallReference: 'ref-session', now });
      const accept = buildInternalAttemptEvent({
        attempt: a.claim.record.attempt,
        type: 'ORIGINATION_ACCEPTED',
        eventId: randomUUID(),
        now,
        extra: { callSessionId: sessionId, providerReference: 'ref-other' },
      });
      expect(await attempts.applyEvent({ ...a.scope, event: accept, now })).toMatchObject({
        kind: 'REJECTED',
        reason: 'PROVIDER_REFERENCE_CONFLICT',
      });
    });
  });
});
