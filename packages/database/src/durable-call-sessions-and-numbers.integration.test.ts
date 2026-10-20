import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleCallEventTrailRepository } from './repositories/call-event-trail-repository.js';
import { DrizzleCallSessionRepository } from './repositories/call-session-repository.js';
import { DrizzleOrganizationPhoneNumberRepository } from './repositories/organization-phone-number-repository.js';
import { buildInternalAttemptEvent } from './repositories/durable-attempt-event-factory.js';
import {
  LOCAL_TEST_DATABASE_URL,
  assertLocalDatabaseUrl,
  countDurableOutboundLeftovers,
  createDurableOutboundFixture,
  destroyDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';

assertLocalDatabaseUrl(LOCAL_TEST_DATABASE_URL);

describe('008-OF2 call sessions and organization phone numbers (PostgreSQL)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: LOCAL_TEST_DATABASE_URL });
  const attempts = new DrizzleCallAttemptRepository(db);
  const sessions = new DrizzleCallSessionRepository(db);
  const numbers = new DrizzleOrganizationPhoneNumberRepository(db);
  const trail = new DrizzleCallEventTrailRepository(db);
  const now = new Date('2026-10-20T12:00:00.000Z');
  let fx: DurableOutboundFixture;
  let attemptId = '';
  let sessionId = '';

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(db);
    const prepared = await attempts.prepareAttempt({
      organizationId: fx.tenantA.organizationId,
      jobId: fx.tenantA.jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now,
    });
    if (prepared.kind !== 'PREPARED') throw new Error('expected PREPARED');
    attemptId = prepared.record.attempt.id;
  });

  afterAll(async () => {
    try {
      await destroyDurableOutboundFixture(db, fx);
      expect(await countDurableOutboundLeftovers(db, fx)).toBe(0);
    } finally {
      await pool.end();
    }
  });

  const scopeA = () => ({ organizationId: fx.tenantA.organizationId, attemptId });

  it('refuses a session before anything was sent (no call can exist yet)', async () => {
    const early = await sessions.create({ ...scopeA(), sessionId: randomUUID(), now });
    expect(early).toEqual({ kind: 'REJECTED', reason: 'ATTEMPT_STATE_INCOMPATIBLE' });
  });

  it('creates a session after send, binds it via the FSM acceptance and keeps accepted ≠ answered', async () => {
    const claim = await attempts.claimSend({
      ...scopeA(),
      ownerId: 'w-1',
      leaseMs: 30_000,
      eventId: randomUUID(),
      now,
    });
    if (claim.kind !== 'CLAIMED') throw new Error('expected CLAIMED');
    sessionId = randomUUID();
    const created = await sessions.create({
      ...scopeA(),
      sessionId,
      providerCallReference: 'opaque-ref',
      now,
    });
    expect(created.kind).toBe('CREATED');
    expect((await sessions.create({ ...scopeA(), sessionId, now })).kind).toBe('ALREADY_EXISTS');
    const accepted = buildInternalAttemptEvent({
      attempt: claim.record.attempt,
      type: 'ORIGINATION_ACCEPTED',
      eventId: randomUUID(),
      now,
      extra: { callSessionId: sessionId, providerReference: 'opaque-ref' },
    });
    const applied = await attempts.applyEvent({
      ...scopeA(),
      event: accepted,
      now,
      fence: claim.fence,
    });
    expect(applied.kind).toBe('APPLIED');
    const session = await sessions.getById({
      organizationId: fx.tenantA.organizationId,
      sessionId,
    });
    expect(session?.runtimeState).toBe('CREATED');
    const stored = await attempts.getById(scopeA());
    expect(stored?.attempt.callSessionId).toBe(sessionId);
  });

  it('rejects a second, different session for the same attempt and any cross-tenant access', async () => {
    const other = await sessions.create({ ...scopeA(), sessionId: randomUUID(), now });
    expect(other).toEqual({ kind: 'REJECTED', reason: 'ATTEMPT_ALREADY_BOUND' });
    const crossTenant = await sessions.create({
      organizationId: fx.tenantB.organizationId,
      attemptId,
      sessionId: randomUUID(),
      now,
    });
    expect(crossTenant).toEqual({ kind: 'REJECTED', reason: 'ATTEMPT_NOT_FOUND' });
    expect(
      await sessions.getById({ organizationId: fx.tenantB.organizationId, sessionId }),
    ).toBeNull();
  });

  it('transitions the session with CAS and never moves backwards or out of a terminal state', async () => {
    const base = { organizationId: fx.tenantA.organizationId, sessionId, now };
    const connecting = await sessions.transition({
      ...base,
      expectedStateVersion: 1,
      toState: 'CONNECTING',
    });
    expect(connecting.kind).toBe('TRANSITIONED');
    expect(
      (await sessions.transition({ ...base, expectedStateVersion: 1, toState: 'ACTIVE' })).kind,
    ).toBe('VERSION_CONFLICT');
    expect(
      (await sessions.transition({ ...base, expectedStateVersion: 2, toState: 'CREATED' })).kind,
    ).toBe('INVALID_TRANSITION');
    const failed = await sessions.transition({
      ...base,
      expectedStateVersion: 2,
      toState: 'FAILED',
      failureReason: 'synthetic',
    });
    expect(failed.kind === 'TRANSITIONED' && failed.session.endedAt).toBeTruthy();
    expect(
      (await sessions.transition({ ...base, expectedStateVersion: 3, toState: 'ACTIVE' })).kind,
    ).toBe('INVALID_TRANSITION');
    const events = await trail.listBySession({
      organizationId: fx.tenantA.organizationId,
      sessionId,
    });
    expect(events.map((e) => e.eventType)).toContain('ORIGINATION_ACCEPTED');
  });

  it('registers synthetic numbers idempotently, blocks global collisions without leaking the owner', async () => {
    const e164Number = `+1555${String(Date.now()).slice(-7)}`;
    const first = await numbers.register({
      organizationId: fx.tenantA.organizationId,
      e164Number,
      twilioPhoneNumberSid: `PN-${fx.runId}`,
    });
    expect(first.kind).toBe('REGISTERED');
    const again = await numbers.register({
      organizationId: fx.tenantA.organizationId,
      e164Number,
      twilioPhoneNumberSid: `PN-${fx.runId}`,
    });
    expect(again.kind).toBe('ALREADY_REGISTERED');
    expect(
      await numbers.register({ organizationId: fx.tenantB.organizationId, e164Number }),
    ).toEqual({ kind: 'UNAVAILABLE' });
    const sidReuse = await numbers.register({
      organizationId: fx.tenantB.organizationId,
      e164Number: '+15555550199',
      twilioPhoneNumberSid: `PN-${fx.runId}`,
    });
    expect(sidReuse).toEqual({ kind: 'UNAVAILABLE' });
    await expect(
      numbers.register({ organizationId: fx.tenantA.organizationId, e164Number: '123' }),
    ).rejects.toThrow();

    if (first.kind !== 'REGISTERED') return;
    const id = first.number.id;
    expect(
      await numbers.getById({ organizationId: fx.tenantB.organizationId, phoneNumberId: id }),
    ).toBeNull();
    const crossRelease = await numbers.release({
      organizationId: fx.tenantB.organizationId,
      phoneNumberId: id,
      expectedVersion: 1,
      now,
    });
    expect(crossRelease).toEqual({ kind: 'NOT_FOUND' });
    expect(
      (
        await numbers.release({
          organizationId: fx.tenantA.organizationId,
          phoneNumberId: id,
          expectedVersion: 9,
          now,
        })
      ).kind,
    ).toBe('VERSION_CONFLICT');
    expect(
      (
        await numbers.release({
          organizationId: fx.tenantA.organizationId,
          phoneNumberId: id,
          expectedVersion: 1,
          now,
        })
      ).kind,
    ).toBe('RELEASED');
    expect(
      (
        await numbers.release({
          organizationId: fx.tenantA.organizationId,
          phoneNumberId: id,
          expectedVersion: 2,
          now,
        })
      ).kind,
    ).toBe('ALREADY_RELEASED');
    expect(
      await numbers.register({ organizationId: fx.tenantB.organizationId, e164Number }),
    ).toEqual({ kind: 'UNAVAILABLE' });
    const page = await numbers.list({ organizationId: fx.tenantA.organizationId, limit: 500 });
    expect(page.every((n) => n.organizationId === fx.tenantA.organizationId)).toBe(true);
    expect(await numbers.list({ organizationId: fx.tenantB.organizationId, limit: 10 })).toEqual(
      [],
    );
  });
});
