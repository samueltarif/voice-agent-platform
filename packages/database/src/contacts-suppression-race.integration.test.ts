import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { DrizzleCallAttemptRepository } from './repositories/call-attempt-repository.js';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import {
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';

const tdb = await createDisposableTestDatabase('contacts-suppression-race');

/**
 * 008-MVP1 (auditoria): supressão e decisão de envio para o MESMO (tenant, E.164)
 * precisam ser linearizáveis. Sem serialização, uma supressão confirmada entre a
 * leitura do `claimSend` e o seu commit ficaria registrada ANTES de um
 * SEND_STARTED que a ignorou. Ambos devem disputar o mesmo lock transacional.
 */
describe('008-MVP1 suppression vs send decision linearization', () => {
  const holder = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 1 });
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  let fx: DurableOutboundFixture;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });

  afterAll(async () => {
    await holder.pool.end();
    await tdb.drop();
  });

  /** Segura o lock de linearização de (tenant, E.164) numa transação aberta. */
  async function holdKey(phoneE164: string) {
    const client = await holder.pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", [
      fx.tenantA.organizationId,
      phoneE164,
    ]);
    return async () => {
      await client.query('COMMIT');
      client.release();
    };
  }

  async function settlesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
    const timer = new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms));
    return (await Promise.race([work.then(() => 'done' as const), timer])) === 'done';
  }

  it('a suppression waits for an in-flight send decision on the same number', async () => {
    const release = await holdKey('+5511933330001');
    const pending = suppressions.addSuppression({
      organizationId: fx.tenantA.organizationId,
      phoneE164: '+5511933330001',
      reason: 'OPT_OUT',
    });
    try {
      expect(await settlesWithin(pending, 300)).toBe(false);
    } finally {
      // Sempre encerra a transação de teste: falha de asserção não pode vazar lock/banco.
      await release();
    }
    expect((await pending).kind).toBe('SUPPRESSED');
  });

  it('a send claim waits for an in-flight suppression on the same number', async () => {
    const jobId = await createExtraJob(tdb.db, {
      tenant: fx.tenantA,
      tag: 'race',
      destinationPhone: '+5511933330002',
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
    const release = await holdKey('+5511933330002');
    const claim = attempts.claimSend({
      organizationId: fx.tenantA.organizationId,
      attemptId: prepared.record.attempt.id,
      ownerId: 'w',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: new Date(),
    });
    try {
      expect(await settlesWithin(claim, 300)).toBe(false);
    } finally {
      await release();
    }
    expect((await claim).kind).toBe('CLAIMED');
  });
});
