import { randomUUID } from 'node:crypto';
import type { TelephonyOriginationPort, TelephonyReconciliationPort } from '@voice-agent/contracts';
import { createDatabaseConnection, type DatabaseInstance } from '../client/connection.js';
import { callAttempts } from '../schema/call-attempts.js';
import { DrizzleCallAttemptRepository } from '../repositories/call-attempt-repository.js';
import { completeOriginationInTransaction } from '../repositories/call-attempt-claims.js';
import { assertLocalDatabaseUrl, LOCAL_TEST_DATABASE_URL } from './durable-outbound-fixtures.js';

/**
 * Processo-filho REAL para testes de crash (008-OF2). Executa passos duráveis
 * e morre abruptamente (SIGKILL) no ponto indicado, sem limpeza nem commit
 * pendente. Sem rede: a "porta" é um objeto local que só conta invocações.
 */
interface ChildArgs {
  readonly mode: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly nowIso: string;
  readonly ownerId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly fence?: { readonly ownerId: string; readonly fencingToken: number } | undefined;
}

const args = JSON.parse(process.argv[2] ?? '{}') as ChildArgs;
const now = new Date(args.nowIso);
const scope = { organizationId: args.organizationId, attemptId: args.attemptId };

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function crash(point: string): never {
  emit({ crashPoint: point });
  process.kill(process.pid, 'SIGKILL');
  throw new Error('unreachable');
}

let portInvocations = 0;
const fakePort: TelephonyOriginationPort & TelephonyReconciliationPort = {
  providerName: 'crash-test-fake',
  async originate() {
    portInvocations += 1;
    emit({ portInvocations });
    return { kind: 'ACCEPTED', providerReference: 'fake-ref' };
  },
  async reconcile() {
    return { kind: 'INCONCLUSIVE' };
  },
};

function prepare(repo: DrizzleCallAttemptRepository) {
  return repo.prepareAttempt({
    organizationId: args.organizationId,
    jobId: args.jobId,
    attemptId: args.attemptId,
    correlationId: randomUUID(),
    intentEventId: randomUUID(),
    now,
  });
}

function claimSend(repo: DrizzleCallAttemptRepository) {
  return repo.claimSend({
    ...scope,
    ownerId: args.ownerId,
    leaseMs: 5_000,
    eventId: randomUUID(),
    now,
  });
}

async function crashInsideUncommittedInsert(db: DatabaseInstance): Promise<never> {
  return db.transaction(async (tx) => {
    await tx
      .insert(callAttempts)
      .values({
        id: args.attemptId,
        organizationId: args.organizationId,
        jobId: args.jobId,
        attemptNumber: 1,
        correlationId: randomUUID(),
        idempotencyKey: `crash-${args.attemptId}`,
        agentId: args.agentId,
        agentVersionId: args.agentVersionId,
        state: 'CREATED',
        createdAt: now,
      })
      .catch(() => crash('B_insert_rejected'));
    return crash('B_before_intent_commit');
  });
}

async function crashBeforeAcceptCommit(db: DatabaseInstance, repo: DrizzleCallAttemptRepository) {
  await prepare(repo);
  const claim = await claimSend(repo);
  if (claim.kind !== 'CLAIMED') throw new Error('claim failed');
  const result = await fakePort.originate({} as never);
  return db.transaction(async (tx) => {
    await completeOriginationInTransaction(tx, {
      ...scope,
      fence: claim.fence,
      result,
      eventId: randomUUID(),
      now,
    });
    return crash('F_accept_applied_not_committed');
  });
}

async function crashAfterPortCall(repo: DrizzleCallAttemptRepository): Promise<never> {
  await prepare(repo);
  await claimSend(repo);
  await fakePort.originate({} as never);
  return crash('E_after_port_before_response_write');
}

async function recoverAndReport(repo: DrizzleCallAttemptRepository): Promise<void> {
  const report = await repo.recoverInterrupted({
    organizationId: args.organizationId,
    recoveryOwnerId: args.ownerId,
    now,
    limit: 50,
    newEventId: randomUUID,
  });
  emit({ report });
}

async function completeWithOldFence(repo: DrizzleCallAttemptRepository): Promise<void> {
  const outcome = await repo.completeOrigination({
    ...scope,
    fence: args.fence!,
    result: { kind: 'ACCEPTED' },
    eventId: randomUUID(),
    now,
  });
  emit({ outcome: outcome.kind });
}

async function run(db: DatabaseInstance, repo: DrizzleCallAttemptRepository): Promise<void> {
  const steps: Record<string, () => Promise<unknown>> = {
    A: async () => crash('A_before_any_write'),
    B: () => crashInsideUncommittedInsert(db),
    C: async () => (await prepare(repo), crash('C_after_intent_before_send')),
    D: async () => (
      await prepare(repo),
      await claimSend(repo),
      crash('D_after_send_started_before_port')
    ),
    E: () => crashAfterPortCall(repo),
    F: () => crashBeforeAcceptCommit(db, repo),
    G: async () => {
      await repo.claimReconciliation({
        ...scope,
        ownerId: args.ownerId,
        leaseMs: 5_000,
        eventId: randomUUID(),
        now,
      });
      return crash('G_during_reconciliation');
    },
    recover: () => recoverAndReport(repo),
    completeWithFence: () => completeWithOldFence(repo),
  };
  const step = steps[args.mode];
  if (!step) throw new Error('unknown mode');
  await step();
}

assertLocalDatabaseUrl(LOCAL_TEST_DATABASE_URL);
const { db, pool } = createDatabaseConnection({
  connectionString: LOCAL_TEST_DATABASE_URL,
  maxConnections: 2,
});
run(db, new DrizzleCallAttemptRepository(db))
  .then(() => emit({ done: true }))
  .finally(() => pool.end());
