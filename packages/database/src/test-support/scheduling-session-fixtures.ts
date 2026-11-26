import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { CallSessionState } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleCallAttemptRepository } from '../repositories/call-attempt-repository.js';
import { DrizzleCallSessionRepository } from '../repositories/call-session-repository.js';
import { buildInternalAttemptEvent } from '../repositories/durable-attempt-event-factory.js';
import { DrizzleOutboundRepository } from '../repositories/outbound-repository.js';
import { outboundCampaigns } from '../schema/outbound.js';
import type { TenantFixture } from './durable-outbound-fixtures.js';
import { SCHEDULING_TEST_NOW } from './scheduling-fixtures.js';

/** Caminho legítimo da sessão até o estado pedido (CREATED → CONNECTING → ACTIVE → ENDING → ENDED). */
const PATH: readonly CallSessionState[] = ['CONNECTING', 'ACTIVE', 'ENDING', 'ENDED'];

export interface BoundCallSession {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly campaignId: string | null;
}

interface BoundSessionInput {
  readonly tenant: TenantFixture;
  readonly destinationPhone: string;
  readonly withCampaign?: boolean;
  readonly state?: CallSessionState;
  readonly sessionId?: string;
  /** `false` = sessão aponta para a tentativa, mas a tentativa NÃO aponta de volta. */
  readonly bindAttempt?: boolean;
}

async function createJobFor(db: DatabaseInstance, input: BoundSessionInput) {
  const { tenant } = input;
  const outbound = new DrizzleOutboundRepository(db);
  const agent = { agentId: tenant.agentId, agentVersionId: tenant.agentVersionId };
  const campaign =
    input.withCampaign === false
      ? null
      : await outbound.createCampaign({
          organizationId: tenant.organizationId,
          ...agent,
          name: `E2 campaign ${randomUUID().slice(0, 8)}`,
          status: 'ACTIVE',
        });
  const job = await outbound.createJob({
    organizationId: tenant.organizationId,
    ...(campaign ? { campaignId: campaign.id } : {}),
    ...agent,
    destinationPhone: input.destinationPhone,
    idempotencyKey: `e2-${randomUUID()}`,
    maxAttempts: 3,
  });
  return { jobId: job.id, campaignId: campaign?.id ?? null };
}

async function sentAttempt(
  attempts: DrizzleCallAttemptRepository,
  scope: { readonly organizationId: string; readonly attemptId: string; readonly jobId: string },
) {
  const now = SCHEDULING_TEST_NOW;
  const prepared = await attempts.prepareAttempt({
    ...scope,
    correlationId: randomUUID(),
    intentEventId: randomUUID(),
    now,
  });
  if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
  const claim = await attempts.claimSend({
    organizationId: scope.organizationId,
    attemptId: scope.attemptId,
    ownerId: 'e2-fixture',
    leaseMs: 60_000,
    eventId: randomUUID(),
    now,
  });
  if (claim.kind !== 'CLAIMED') throw new Error(claim.kind);
  return claim;
}

/**
 * E2 PR 1 — sessão durável VINCULADA a uma tentativa pelos repositórios reais
 * (preparo → claim de envio → criação da sessão → aceite com `callSessionId`
 * pela FSM → transições da sessão). Sem atalhos em SQL: o vínculo nos dois
 * sentidos é o mesmo da produção. `sessionId` pode ser o `callId` de uma
 * concessão emitida pelo gateway.
 */
export async function createBoundCallSession(
  db: DatabaseInstance,
  input: BoundSessionInput,
): Promise<BoundCallSession> {
  const organizationId = input.tenant.organizationId;
  const job = await createJobFor(db, input);
  const attempts = new DrizzleCallAttemptRepository(db);
  const scope = { organizationId, attemptId: randomUUID() };
  const claim = await sentAttempt(attempts, { ...scope, jobId: job.jobId });
  const sessions = new DrizzleCallSessionRepository(db);
  const sessionId = input.sessionId ?? randomUUID();
  const now = SCHEDULING_TEST_NOW;
  const created = await sessions.create({ ...scope, sessionId, now });
  if (created.kind !== 'CREATED') throw new Error(created.kind);
  const result = { sessionId, attemptId: scope.attemptId, ...job };
  if (input.bindAttempt === false) return result;
  const event = buildInternalAttemptEvent({
    attempt: claim.record.attempt,
    type: 'ORIGINATION_ACCEPTED',
    eventId: randomUUID(),
    now,
    extra: { callSessionId: sessionId },
  });
  const applied = await attempts.applyEvent({ ...scope, event, now, fence: claim.fence });
  if (applied.kind !== 'APPLIED') throw new Error(applied.kind);
  await advanceSession(sessions, { organizationId, sessionId }, input.state ?? 'ACTIVE');
  return result;
}

export async function advanceSession(
  sessions: DrizzleCallSessionRepository,
  scope: { readonly organizationId: string; readonly sessionId: string },
  target: CallSessionState,
): Promise<void> {
  if (target === 'CREATED') return;
  if (target === 'FAILED') {
    await sessions.transition({
      ...scope,
      expectedStateVersion: 1,
      toState: 'FAILED',
      now: SCHEDULING_TEST_NOW,
    });
    return;
  }
  const current = await sessions.getById(scope);
  let version = current!.stateVersion;
  for (const toState of PATH.slice(PATH.indexOf(current!.runtimeState) + 1)) {
    const result = await sessions.transition({
      ...scope,
      expectedStateVersion: version,
      toState,
      now: SCHEDULING_TEST_NOW,
    });
    if (result.kind !== 'TRANSITIONED') throw new Error(result.kind);
    version = result.session.stateVersion;
    if (toState === target) return;
  }
}

/** Configura (dado de teste) a agenda da campanha — 1ª fonte da prioridade D1. */
export async function setCampaignSchedulingCalendar(
  db: DatabaseInstance,
  input: {
    readonly organizationId: string;
    readonly campaignId: string;
    readonly calendarId: string | null;
  },
): Promise<void> {
  await db
    .update(outboundCampaigns)
    .set({ schedulingCalendarId: input.calendarId })
    .where(
      and(
        eq(outboundCampaigns.id, input.campaignId),
        eq(outboundCampaigns.organizationId, input.organizationId),
      ),
    );
}
