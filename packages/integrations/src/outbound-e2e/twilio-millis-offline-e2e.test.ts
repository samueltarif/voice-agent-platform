import { describe, expect, it } from 'vitest';
import type { FakeCallScenario } from '../twilio-outbound/fake-twilio-callback-script.js';
import {
  createOfflineHarness,
  ORG_A,
  PUBLISHED_CONFIG,
  startInput,
  type HarnessOptions,
} from './fixtures/offline-e2e-harness.js';

/**
 * 008-OF5 (S4) — E2E OFFLINE: campanha sintética → portão → tentativa →
 * sessão Millis (simulada) → write-ahead → Twilio (simulada) → callbacks
 * assinados → encerramento → orçamento pendente de reconciliação.
 */
type Harness = ReturnType<typeof createOfflineHarness>;

async function placeCall(h: Harness, input = startInput(ORG_A)) {
  const result = await h.orchestrator.start(input);
  const ref = { organizationId: input.attempt.organizationId, attemptId: input.attempt.attemptId };
  return { input, ref, result, sid: [...h.twilio.calls.keys()].at(-1) ?? null };
}

async function runScenario(h: Harness, scenario: FakeCallScenario) {
  const call = await placeCall(h);
  const outcomes = [];
  for (const delivery of h.twilio.callbacksFor(call.sid!, scenario, h.now)) {
    outcomes.push(await h.deliver(delivery));
  }
  return { ...call, outcomes };
}

function accepting(): HarnessOptions {
  return { unknownValidity: 'ACCEPT_BY_HUMAN_DECISION' };
}

describe('S4 E2E — answered call, end to end', () => {
  it('prepares the published agent, dials once, bridges, closes and releases resources', async () => {
    const h = createOfflineHarness(accepting());
    const { ref, result, sid, outcomes } = await runScenario(h, 'ANSWERED_AND_COMPLETED');
    expect(result).toEqual({ kind: 'SENT', providerReference: sid });
    expect(outcomes.every((o) => o === 'APPLIED')).toBe(true);
    expect(h.coordinator.getAttempt(ref)?.state).toBe('CLOSED');
    expect(h.twilio.createRequestCount).toBe(1);
    expect(h.millis.registerCount).toBe(1);
    expect(h.millis.requests[0]!.body).toMatchObject({ agent_config: PUBLISHED_CONFIG });
    expect(JSON.stringify(h.millis.requests)).not.toContain('+55');
    const legs = h.sessions.getLegs(ref.organizationId, ref.attemptId);
    expect(legs.map((l) => `${l.role}:${l.state}`).sort()).toEqual([
      'AI_AGENT_LEG:COMPLETED',
      'CONTACT_LEG:COMPLETED',
    ]);
    expect(h.sessions.getPreparation(ref.organizationId, ref.attemptId)?.sessionState).toBe(
      'TERMINATED',
    );
    expect(h.sessions.getBudgetDisposition(ref.organizationId, ref.attemptId)).toBe(
      'PENDING_RECONCILIATION',
    );
    expect(h.sessions.anomalies).toEqual([]);
    const twiml = [...h.twilio.calls.values()][0]!.twiml;
    expect(twiml).toContain('sip:call-000001@sip.millis.example.test;region=br1;transport=tls');
  });

  it.each([
    ['BUSY', 'BUSY'],
    ['NO_ANSWER', 'NO_ANSWER'],
    ['FAILED', 'FAILED'],
  ] as const)(
    '%s: closes without AI leg, terminates the session, never redials',
    async (scenario, state) => {
      const h = createOfflineHarness(accepting());
      const { ref } = await runScenario(h, scenario);
      expect(h.coordinator.getAttempt(ref)?.state).toBe('CLOSED');
      expect(h.sessions.getLegs(ref.organizationId, ref.attemptId)).toEqual([
        expect.objectContaining({ role: 'CONTACT_LEG', state }),
      ]);
      expect(h.sessions.getPreparation(ref.organizationId, ref.attemptId)?.sessionState).toBe(
        'TERMINATED',
      );
      expect(h.twilio.createRequestCount).toBe(1);
    },
  );

  it('SIP failure after answer: AI leg fails with 480, call closes, no redial', async () => {
    const h = createOfflineHarness(accepting());
    const { ref } = await runScenario(h, 'ANSWERED_THEN_SIP_FAILURE');
    expect(h.sessions.getLegResults(ref.organizationId, ref.attemptId)).toEqual([
      expect.objectContaining({ bridgeStatus: 'FAILED', transportResponseCode: 480 }),
    ]);
    expect(h.coordinator.getAttempt(ref)?.state).toBe('CLOSED');
    expect(h.twilio.createRequestCount).toBe(1);
  });

  it.each(['CONTACT_HUNG_UP_FIRST', 'AI_SESSION_ENDED_FIRST'] as const)(
    '%s: closes and terminates once',
    async (scenario) => {
      const h = createOfflineHarness(accepting());
      if (scenario === 'AI_SESSION_ENDED_FIRST')
        h.millis.queueRegisterOutcome({ kind: 'OK', uriKey: 'sip', withSessionId: true });
      const { ref } = await runScenario(h, scenario);
      expect(h.coordinator.getAttempt(ref)?.state).toBe('CLOSED');
      expect(h.millis.requests.filter((r) => r.path.endsWith('/terminate'))).toHaveLength(1);
    },
  );
});

describe('S4 E2E — duplicates, ordering and races', () => {
  it('duplicated and replayed callbacks have no extra effect', async () => {
    const h = createOfflineHarness(accepting());
    const call = await placeCall(h);
    const deliveries = h.twilio.callbacksFor(call.sid!, 'ANSWERED_AND_COMPLETED', h.now);
    for (const delivery of deliveries) {
      await h.deliver(delivery);
      expect(await h.deliver(delivery)).toMatch(/^(DUPLICATE|STALE|APPLIED)$/);
    }
    const late = deliveries[1]!;
    expect(await h.deliver(late)).toMatch(/^(DUPLICATE|STALE)$/);
    expect(h.coordinator.getAttempt(call.ref)?.state).toBe('CLOSED');
    expect(h.millis.requests.filter((r) => r.path.endsWith('/terminate'))).toHaveLength(1);
  });

  it('callback before the synchronous response binds the same CallSid without anomaly', async () => {
    const holder: { h?: Harness; early: string[]; stateBeforeResponse?: string } = { early: [] };
    const h = createOfflineHarness({
      ...accepting(),
      twilioTransport: (inner) => ({
        async send(request) {
          const response = await inner.send(request);
          if (request.path !== '/Calls.json') return response;
          const harness = holder.h!;
          const sid = [...harness.twilio.calls.keys()].at(-1)!;
          const first = harness.twilio
            .callbacksFor(sid, 'ANSWERED_AND_COMPLETED', harness.now)
            .slice(0, 2);
          for (const delivery of first) holder.early.push(await harness.deliver(delivery));
          const attempt = harness.attempts.listByOrganization(ORG_A)[0]!;
          holder.stateBeforeResponse = `${attempt.state}:${attempt.providerReference}`;
          return response;
        },
      }),
    });
    holder.h = h;
    const call = await placeCall(h);
    expect(holder.early).toEqual(['APPLIED', 'APPLIED']);
    expect(holder.stateBeforeResponse).toBe(`ORIGINATION_ACCEPTED:${call.sid}`);
    expect(call.result).toEqual({ kind: 'SENT', providerReference: call.sid });
    expect(h.sessions.anomalies).toEqual([]);
    expect(h.twilio.createRequestCount).toBe(1);
  });

  it('lost response: OUTCOME_UNKNOWN, then a signed callback proves origination (no redial)', async () => {
    const h = createOfflineHarness(accepting());
    h.twilio.queueCreateOutcome({ kind: 'ACCEPT_BUT_LOSE_RESPONSE', cause: 'TIMEOUT' });
    const call = await placeCall(h);
    expect(call.result).toEqual({ kind: 'OUTCOME_UNKNOWN' });
    expect(h.coordinator.getAttempt(call.ref)?.state).toBe('OUTCOME_UNKNOWN');
    for (const delivery of h.twilio.callbacksFor(call.sid!, 'ANSWERED_AND_COMPLETED', h.now)) {
      await h.deliver(delivery);
    }
    expect(h.coordinator.getAttempt(call.ref)).toMatchObject({
      state: 'CLOSED',
      providerReference: call.sid,
    });
    expect(h.twilio.createRequestCount).toBe(1);
  });

  it('two concurrent attempts for the same job: only one is dialed', async () => {
    const h = createOfflineHarness(accepting());
    const first = startInput(ORG_A);
    const second = { ...startInput(ORG_A, first.attempt.jobId) };
    const [a, b] = await Promise.all([h.orchestrator.start(first), h.orchestrator.start(second)]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['NOT_SENT', 'SENT']);
    expect([a, b].find((r) => r.kind === 'NOT_SENT')).toMatchObject({ reason: 'ATTEMPT_BLOCKED' });
    expect(h.twilio.createRequestCount).toBe(1);
    expect(h.millis.registerCount).toBe(1);
  });
});
