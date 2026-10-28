import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ToolExecutionContext, ToolInvocation, ToolPort } from '@voice-agent/contracts';
import {
  createDatabaseConnection,
  DrizzleCallAttemptRepository,
  DrizzleOutboundBudgetRepository,
  DrizzleProviderEventAttemptStore,
} from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createDurableOutboundFixture,
  createExtraJob,
  type DurableOutboundFixture,
  type TenantFixture,
} from '@voice-agent/database/test-support';
import { createNullLogger } from '@voice-agent/logger';
import { registerProviderWebhookRoutes } from '../webhooks/provider-webhook-routes.js';

const tdb = await createDisposableTestDatabase('provider-webhook-ingress');

/** 008-OF4 ponta a ponta: HTTP → autenticação fake → FSM durável real → ledger real. */
describe('008-OF4 provider webhook ingress against real PostgreSQL', () => {
  const attempts = new DrizzleCallAttemptRepository(tdb.db);
  const raw = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 1 });
  const budget = new DrizzleOutboundBudgetRepository(tdb.db);
  const toolCalls: Array<{ invocation: ToolInvocation; context: ToolExecutionContext }> = [];
  const tools: ToolPort = {
    executeTool: async (invocation, context) => {
      toolCalls.push({ invocation, context });
      return { status: 'SUCCESS', toolName: invocation.toolName, output: { ok: true } };
    },
  };
  const app = new Hono();
  let fx: DurableOutboundFixture;

  registerProviderWebhookRoutes(app, {
    providers: new Map([
      [
        'fake',
        {
          authenticator: {
            authenticate: async (r) =>
              r.headers['x-test-signature'] === 'valid'
                ? { kind: 'AUTHENTICATED' }
                : { kind: 'REJECTED', reason: 'INVALID_CREDENTIALS' },
          },
          normalizer: { normalize: (r) => JSON.parse(r.rawBody) },
        },
      ],
    ]),
    store: new DrizzleProviderEventAttemptStore(tdb.db),
    tools,
    toolTimeoutMs: 2_000,
    logger: createNullLogger(),
    now: () => new Date(),
  });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    await budget.provisionGlobalLedger({
      allocatedBudgetMinorUnits: 1_000_000,
      maxConcurrentCalls: 50,
    });
    for (const t of [fx.tenantA, fx.tenantB]) {
      await budget.provisionLedger({
        organizationId: t.organizationId,
        allocatedBudgetMinorUnits: 100_000,
        maxConcurrentCalls: 100,
      });
    }
  });

  afterAll(async () => {
    await raw.pool.end();
    await tdb.drop();
  });

  const post = (channel: 'events' | 'tools', body: unknown, signature = 'valid') =>
    app.request(`/v1/provider-webhooks/fake/${channel}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-signature': signature },
      body: JSON.stringify(body),
    });

  const status = (ref: string, s: string, providerEventId: string | null = randomUUID()) => ({
    kind: 'CALL_STATUS',
    providerEventId,
    providerCallReference: ref,
    occurredAt: '2026-10-28T12:00:00.000Z',
    status: s,
  });

  /** Tentativa enviada; `accept` grava a referência do provedor via FSM real. */
  async function sentAttempt(tenant: TenantFixture, ref: string, accept: boolean) {
    const jobId = await createExtraJob(tdb.db, { tenant, tag: 'webhook' });
    const prepared = await attempts.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const a = prepared.record.attempt;
    const scope = { organizationId: a.organizationId, attemptId: a.id };
    const reserved = await budget.reserveBudget({
      ...scope,
      jobId: a.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: a.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');
    const claim = await attempts.claimSend({
      ...scope,
      ownerId: 'w',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: new Date(),
    });
    if (claim.kind !== 'CLAIMED') throw new Error(claim.reason);
    const result = accept
      ? ({ kind: 'ACCEPTED', providerReference: ref } as const)
      : ({ kind: 'UNKNOWN', reasonCode: 'TIMEOUT' } as const);
    await attempts.completeOrigination({
      ...scope,
      fence: claim.fence,
      result,
      eventId: randomUUID(),
      now: new Date(),
    });
    return scope;
  }

  /** Tentativa com SEND_STARTED gravado e nenhum desfecho (worker morto durante o envio). */
  async function claimedOnly(tenant: TenantFixture) {
    const jobId = await createExtraJob(tdb.db, { tenant, tag: 'webhook-claimed' });
    const prepared = await attempts.prepareAttempt({
      organizationId: tenant.organizationId,
      jobId,
      attemptId: randomUUID(),
      correlationId: randomUUID(),
      intentEventId: randomUUID(),
      now: new Date(),
    });
    if (prepared.kind !== 'PREPARED') throw new Error(prepared.reason);
    const a = prepared.record.attempt;
    const scope = { organizationId: a.organizationId, attemptId: a.id };
    const reserved = await budget.reserveBudget({
      ...scope,
      jobId: a.jobId,
      estimatedAmountMinorUnits: 500,
      estimatedCarrierMinorUnits: 300,
      estimatedConversationalMinorUnits: 200,
      idempotencyKey: a.idempotencyKey,
    });
    expect(reserved.kind).toBe('RESERVED');
    const claim = await attempts.claimSend({
      ...scope,
      ownerId: 'w',
      leaseMs: 60_000,
      eventId: randomUUID(),
      now: new Date(),
    });
    if (claim.kind !== 'CLAIMED') throw new Error(claim.reason);
    return scope;
  }

  const providerRows = (attemptId: string) =>
    raw.pool.query(
      "SELECT event_type, source, provider FROM call_events WHERE attempt_id = $1 AND source = 'PROVIDER'",
      [attemptId],
    );
  const stateOf = async (scope: { organizationId: string; attemptId: string }) =>
    (await attempts.getById(scope))?.attempt.state;

  it('rejects unauthenticated deliveries and unknown providers with an identical 401', async () => {
    const forged = await post('events', status('CA-forged', 'CLOSED'), 'forged');
    const unknown = await app.request('/v1/provider-webhooks/other/events', {
      method: 'POST',
      body: '{}',
    });
    expect(forged.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await forged.json()).toEqual(await unknown.json());
  });

  it('applies a status once, ignores exact redelivery and never regresses a terminal state', async () => {
    const scope = await sentAttempt(fx.tenantA, 'CA-close-1', true);
    const closed = status('CA-close-1', 'CLOSED', 'evt-close-1');
    expect((await post('events', closed)).status).toBe(202);
    expect((await post('events', closed)).status).toBe(202);
    expect((await post('events', status('CA-close-1', 'ACCEPTED', 'evt-late'))).status).toBe(202);
    expect(await stateOf(scope)).toBe('CLOSED');
    const rows = (await providerRows(scope.attemptId)).rows as Array<{ event_type: string }>;
    expect(rows.filter((r) => r.event_type === 'CALL_CLOSED_CONFIRMED')).toHaveLength(1);
    expect(rows.every((r) => (r as unknown as { provider: string }).provider === 'fake')).toBe(
      true,
    );
  });

  it('deduplicates deliveries without a provider event id by a deterministic composite key', async () => {
    const scope = await sentAttempt(fx.tenantA, 'CA-noid-1', true);
    for (let i = 0; i < 3; i += 1) await post('events', status('CA-noid-1', 'CLOSED', null));
    const rows = (await providerRows(scope.attemptId)).rows;
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['SEND_STARTED', 'CA-rej-sent'],
    ['OUTCOME_UNKNOWN', 'CA-rej-unknown'],
  ] as const)(
    'a provider rejection after %s never releases funds; a later realized cost is still recorded',
    async (phase, ref) => {
      const scope =
        phase === 'SEND_STARTED'
          ? await claimedOnly(fx.tenantA)
          : await sentAttempt(fx.tenantA, ref, false);
      // Simula adapter que registra a referência antes do desfecho (contrato real: 008-OF5).
      await raw.pool.query(
        'UPDATE call_attempts SET provider_reference = $2, state_version = state_version + 1 WHERE id = $1',
        [scope.attemptId, ref],
      );
      const before = await budget.getLedger(scope.organizationId);
      const rejected = {
        ...status(ref, 'REJECTED', `evt-${ref}`),
        rejectionReason: 'DESTINATION_NOT_ALLOWED',
      };
      await post('events', rejected);
      await post('events', rejected);
      expect(await stateOf(scope)).toBe('ORIGINATION_REJECTED');
      const after = await budget.getLedger(scope.organizationId);
      expect(after?.reservedAmountMinorUnits).toBe(before?.reservedAmountMinorUnits);
      // Semântica de custo da rejeição é PROVIDER-UNVERIFIED: a dívida realizada continua registrável.
      const settled = await budget.settleBudget({
        ...scope,
        actualCarrierCostMinorUnits: 120,
        actualConversationalCostMinorUnits: 30,
      });
      expect(settled.kind).toBe('SETTLED');
    },
  );

  it('applies concurrent identical deliveries exactly once', async () => {
    const scope = await sentAttempt(fx.tenantA, 'CA-race-1', true);
    const closed = status('CA-race-1', 'CLOSED', 'evt-race-1');
    const responses = await Promise.all(Array.from({ length: 10 }, () => post('events', closed)));
    expect(responses.every((r) => r.status === 202)).toBe(true);
    expect((await providerRows(scope.attemptId)).rows).toHaveLength(1);
    expect(await stateOf(scope)).toBe('CLOSED');
  });

  it('scopes official event ids to the call reference (no cross-call collision)', async () => {
    const first = await sentAttempt(fx.tenantA, 'CA-scope-1', true);
    const second = await sentAttempt(fx.tenantB, 'CA-scope-2', true);
    await post('events', status('CA-scope-1', 'CLOSED', 'reused-id'));
    await post('events', status('CA-scope-2', 'CLOSED', 'reused-id'));
    expect(await stateOf(first)).toBe('CLOSED');
    expect(await stateOf(second)).toBe('CLOSED');
  });

  it('never acts on a reference shared by two tenants (ambiguous, uniform response)', async () => {
    const a = await sentAttempt(fx.tenantA, 'CA-shared', true);
    const b = await sentAttempt(fx.tenantB, 'CA-shared', true);
    const response = await post('events', status('CA-shared', 'CLOSED'));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true });
    expect(await stateOf(a)).toBe('ORIGINATION_ACCEPTED');
    expect(await stateOf(b)).toBe('ORIGINATION_ACCEPTED');
  });

  it('rejects tenant fields smuggled into the normalized payload', async () => {
    await sentAttempt(fx.tenantA, 'CA-smuggle', true);
    const smuggled = {
      ...status('CA-smuggle', 'CLOSED'),
      organizationId: fx.tenantB.organizationId,
    };
    expect((await post('events', smuggled)).status).toBe(400);
  });

  it('dispatches tools with server-side tenant context only while the call is live', async () => {
    const live = await sentAttempt(fx.tenantA, 'CA-tool-1', true);
    const invoke = (ref: string) => ({
      kind: 'TOOL_INVOCATION',
      providerEventId: null,
      providerCallReference: ref,
      occurredAt: '2026-10-28T12:00:00.000Z',
      toolName: 'catalog_search',
      invocationId: randomUUID(),
      arguments: { organizationId: fx.tenantB.organizationId, query: 'x' },
    });
    const ok = await post('tools', invoke('CA-tool-1'));
    expect(await ok.json()).toMatchObject({ status: 'SUCCESS' });
    expect(toolCalls.at(-1)?.context).toMatchObject({
      organizationId: live.organizationId,
      agentVersionId: fx.tenantA.agentVersionId,
      callId: live.attemptId,
    });
    await post('events', status('CA-tool-1', 'CLOSED'));
    const calls = toolCalls.length;
    const closed = await post('tools', invoke('CA-tool-1'));
    const unknown = await post('tools', invoke('CA-nobody'));
    expect(await closed.json()).toEqual(await unknown.json());
    expect(toolCalls).toHaveLength(calls);
  });
});
