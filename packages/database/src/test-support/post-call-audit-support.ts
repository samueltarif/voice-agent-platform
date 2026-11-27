import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SchedulingAgentScope } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleCallAttemptRepository } from '../repositories/call-attempt-repository.js';
import type { ClaimResult } from '../repositories/call-attempt-claims.js';
import { buildInternalAttemptEvent } from '../repositories/durable-attempt-event-factory.js';
import { DrizzleOutboundRepository } from '../repositories/outbound-repository.js';
import type { TenantFixture } from './durable-outbound-fixtures.js';
import {
  intentsOf,
  leadStatusOrigins,
  meetingsOfLead,
  reconciliationOf,
  suppressionsOf,
} from './scheduling-agent-queries.js';
import { SCHEDULING_TEST_NOW } from './scheduling-fixtures.js';

/**
 * Auditoria #184 — apoio dos testes adversariais: tentativas ao MESMO telefone
 * (preparo, claim, rejeição, encerramento) e um retrato conjunto do estado
 * (reunião, intenção, reconciliação, supressão, histórico comercial e o
 * resultado do próximo claim), para que cada cenário afirme tudo junto.
 */

export interface AttemptScope {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly jobId: string;
}

const now = SCHEDULING_TEST_NOW;

export async function prepareAttemptTo(
  db: DatabaseInstance,
  input: { readonly tenant: TenantFixture; readonly phone: string },
): Promise<AttemptScope> {
  const job = await new DrizzleOutboundRepository(db).createJob({
    organizationId: input.tenant.organizationId,
    agentId: input.tenant.agentId,
    agentVersionId: input.tenant.agentVersionId,
    destinationPhone: input.phone,
    idempotencyKey: `audit184-${randomUUID()}`,
    maxAttempts: 1,
  });
  const scope = {
    organizationId: input.tenant.organizationId,
    attemptId: randomUUID(),
    jobId: job.id,
  };
  const attempts = new DrizzleCallAttemptRepository(db);
  await attempts.prepareAttempt({
    ...scope,
    correlationId: randomUUID(),
    intentEventId: randomUUID(),
    now,
  });
  return scope;
}

export function claimAttempt(db: DatabaseInstance, scope: AttemptScope): Promise<ClaimResult> {
  return new DrizzleCallAttemptRepository(db).claimSend({
    ...scope,
    ownerId: `audit184-${scope.attemptId}`,
    leaseMs: 60_000,
    eventId: randomUUID(),
    now,
  });
}

/** Nova tentativa (outra campanha/job) ao mesmo telefone: o resultado do claim. */
export async function nextClaim(
  db: DatabaseInstance,
  input: { readonly tenant: TenantFixture; readonly phone: string },
): Promise<ClaimResult['kind'] | string> {
  let scope: AttemptScope;
  try {
    scope = await prepareAttemptTo(db, input);
  } catch (error) {
    // Destino suprimido: o banco recusa até a criação do job (gatilho da 008-MVP1).
    if (constraintOf(error) === 'outbound_call_jobs_destination_not_suppressed') {
      return 'JOB_REFUSED_SUPPRESSED';
    }
    throw error;
  }
  const result = await claimAttempt(db, scope);
  return result.kind === 'CLAIMED' ? 'CLAIMED' : result.reason;
}

function constraintOf(error: unknown): string | undefined {
  for (let e = error as { constraint?: string; cause?: unknown } | undefined; e; ) {
    if (e.constraint) return e.constraint;
    e = e.cause as typeof e;
  }
  return undefined;
}

export async function rejectOrigination(
  db: DatabaseInstance,
  scope: AttemptScope,
  claim: ClaimResult,
): Promise<void> {
  if (claim.kind !== 'CLAIMED') throw new Error('expected CLAIMED');
  const outcome = await new DrizzleCallAttemptRepository(db).completeOrigination({
    ...scope,
    fence: claim.fence,
    result: { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' },
    eventId: randomUUID(),
    now,
  });
  if (outcome.kind !== 'APPLIED') throw new Error(outcome.kind);
}

export async function closeAttempt(
  db: DatabaseInstance,
  scope: { readonly organizationId: string; readonly attemptId: string },
): Promise<void> {
  const attempts = new DrizzleCallAttemptRepository(db);
  const record = await attempts.getById(scope);
  if (!record) throw new Error('attempt not found');
  const event = buildInternalAttemptEvent({
    attempt: record.attempt,
    type: 'CALL_CLOSED_CONFIRMED',
    eventId: randomUUID(),
    now,
  });
  const applied = await attempts.applyEvent({ ...scope, event, now });
  if (applied.kind !== 'APPLIED') throw new Error(applied.kind);
}

/** A versão do agente passa a publicar as ferramentas da E2 (tentativas existentes inclusive). */
export async function markE2AgentVersion(db: DatabaseInstance, tenant: TenantFixture) {
  await db.execute(sql`UPDATE agent_versions
    SET configuration = jsonb_set(configuration, '{tools}', '["lead.record_opt_out","lead.record_outcome"]'::jsonb)
    WHERE id = ${tenant.agentVersionId} AND organization_id = ${tenant.organizationId}`);
}

/** Retrato conjunto exigido pela reauditoria. */
export async function stateOf(
  db: DatabaseInstance,
  s: {
    readonly scope: SchedulingAgentScope;
    readonly tenant: TenantFixture;
    readonly leadId: string;
    readonly phone: string;
  },
) {
  const org = s.scope.organizationId;
  const reconciliation = await reconciliationOf(db, s.scope);
  return {
    meetings: (await meetingsOfLead(db, org, s.leadId)).length,
    intents: (await intentsOf(db, s.scope)).map((i) => `${i.status}:${i.decisionReason ?? '-'}`),
    reconciliation: reconciliation
      ? { status: reconciliation.status, reasons: reconciliation.reviewReasons }
      : null,
    suppressions: await suppressionsOf(db, org, s.phone),
    commercial: (await leadStatusOrigins(db, org, s.leadId)).map((o) => `${o.origin}:${o.to}`),
    nextClaim: await nextClaim(db, { tenant: s.tenant, phone: s.phone }),
  };
}
