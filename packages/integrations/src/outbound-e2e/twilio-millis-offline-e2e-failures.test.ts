import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ConversationSessionPort } from '@voice-agent/contracts';
import { buildTwilioSignaturePayload } from '../twilio/twilio-signature-validator.js';
import { FAKE_TWILIO_AUTH_TOKEN } from '../twilio-outbound/fake-twilio-origination-simulator.js';
import type { FakeCallbackDelivery } from '../twilio-outbound/fake-twilio-callback-script.js';
import {
  allowedGate,
  createOfflineHarness,
  ORG_A,
  ORG_B,
  startInput,
} from './fixtures/offline-e2e-harness.js';

/**
 * 008-OF5 (S4) — E2E OFFLINE das fronteiras de falha: nada é discado quando a
 * sessão, o portão ou o orçamento recusam; anomalias só alertam; crash nunca
 * gera rediscagem; o kill switch encerra telefonia e sessão.
 */
const accepting = { unknownValidity: 'ACCEPT_BY_HUMAN_DECISION' as const };

function resign(
  delivery: FakeCallbackDelivery,
  params: Record<string, string>,
): FakeCallbackDelivery {
  const signature = createHmac('sha1', FAKE_TWILIO_AUTH_TOKEN)
    .update(buildTwilioSignaturePayload(delivery.url, params), 'utf8')
    .digest('base64');
  return { ...delivery, params, signature };
}

describe('S4 E2E — nothing is dialed when the session cannot be trusted', () => {
  it('default policy refuses unknown validity: session terminated, zero dial', async () => {
    const h = createOfflineHarness();
    const input = startInput(ORG_A);
    expect(await h.orchestrator.start(input)).toEqual({
      kind: 'NOT_SENT',
      reason: 'SESSION_VALIDITY_UNKNOWN',
    });
    expect(h.twilio.createRequestCount).toBe(0);
    expect(h.millis.requests.map((r) => r.path)).toEqual([
      '/register_sip_call',
      '/sessions/sess_000001/terminate',
    ]);
    expect(h.coordinator.getAttempt(input.attempt)?.state).toBe('CANCELED');
    expect(h.sessions.getBudgetDisposition(ORG_A, input.attempt.attemptId)).toBe('RELEASE');
  });

  it('expired preparation is refused and terminated', async () => {
    const terminated: string[] = [];
    const expired: ConversationSessionPort = {
      prepare: async () => ({
        kind: 'PREPARED',
        sessionRef: 'ref-expired',
        mediaTarget: { kind: 'SIP_URI', uri: 'sip:x@y.test' },
        expiresAt: '2026-11-11T11:59:00.000Z',
      }),
      terminate: async (ref) => (terminated.push(ref.sessionRef), 'TERMINATED'),
      getStatus: async () => 'ACTIVE',
    };
    const h = createOfflineHarness({ ...accepting, conversation: expired });
    expect(await h.orchestrator.start(startInput(ORG_A))).toEqual({
      kind: 'NOT_SENT',
      reason: 'SESSION_EXPIRED',
    });
    expect(terminated).toEqual(['ref-expired']);
    expect(h.twilio.createRequestCount).toBe(0);
  });

  it.each([
    ['timeout', { kind: 'NO_RESPONSE', cause: 'TIMEOUT' }],
    ['provider down', { kind: 'HTTP_ERROR', status: 503 }],
    ['auth failure', { kind: 'HTTP_ERROR', status: 401 }],
  ] as const)(
    'Millis %s → attempt canceled, budget released, zero dial',
    async (_name, outcome) => {
      const h = createOfflineHarness(accepting);
      h.millis.queueRegisterOutcome(outcome);
      const input = startInput(ORG_A);
      expect(await h.orchestrator.start(input)).toEqual({
        kind: 'NOT_SENT',
        reason: 'SESSION_UNAVAILABLE',
      });
      expect(h.coordinator.getAttempt(input.attempt)?.state).toBe('CANCELED');
      expect(h.sessions.getBudgetDisposition(ORG_A, input.attempt.attemptId)).toBe('RELEASE');
      expect(h.twilio.createRequestCount).toBe(0);
    },
  );
});

describe('S4 E2E — write-ahead before any dial', () => {
  it('if the prepared session cannot be persisted, nothing is dialed and the session ends', async () => {
    const h = createOfflineHarness({ ...accepting, randomBytes: (n) => new Uint8Array(n).fill(7) });
    expect((await h.orchestrator.start(startInput(ORG_A))).kind).toBe('SENT');
    const second = startInput(ORG_A);
    expect(await h.orchestrator.start(second)).toEqual({
      kind: 'NOT_SENT',
      reason: 'PREPARATION_NOT_PERSISTED',
    });
    expect(h.twilio.createRequestCount).toBe(1);
    expect(h.millis.sessions.get('sess_000002')?.callStatus).toBe('api-ended');
    expect(h.coordinator.getAttempt(second.attempt)?.state).toBe('CANCELED');
  });
});

describe('S4 E2E — gate is fail-closed before any provider request', () => {
  it.each([
    ['budget exceeded', allowedGate(ORG_A, 5_000), 'BUDGET_DENIED'],
    ['kill switch', { ...allowedGate(ORG_A), killSwitchEngaged: true }, 'KILL_SWITCH_ENGAGED'],
    [
      'draft agent',
      { ...allowedGate(ORG_A), agentVersion: { organizationId: ORG_A, status: 'DRAFT' as const } },
      'AGENT_VERSION_NOT_PUBLISHED',
    ],
    [
      'agent of another org',
      {
        ...allowedGate(ORG_A),
        agentVersion: { organizationId: ORG_B, status: 'PUBLISHED' as const },
      },
      'AGENT_VERSION_NOT_PUBLISHED',
    ],
    [
      'paused campaign',
      { ...allowedGate(ORG_A), campaignState: 'PAUSED' as const },
      'CAMPAIGN_NOT_ACTIVE',
    ],
    [
      'suppressed destination',
      { ...allowedGate(ORG_A), destinationSuppressed: true },
      'DESTINATION_SUPPRESSED',
    ],
    [
      'entitlement inactive',
      { ...allowedGate(ORG_A), entitlementActive: false },
      'ENTITLEMENT_INACTIVE',
    ],
  ])('%s', async (_name, gate, detail) => {
    const h = createOfflineHarness(accepting);
    expect(await h.orchestrator.start({ ...startInput(ORG_A), gate })).toEqual({
      kind: 'NOT_SENT',
      reason: 'GATE_BLOCKED',
      detail,
    });
    expect(h.millis.requests).toHaveLength(0);
    expect(h.twilio.requests).toHaveLength(0);
    expect(h.attempts.listByOrganization(ORG_A)).toHaveLength(0);
  });
});

describe('S4 E2E — anomalies alert, never hang up or redial', () => {
  it('divergent CallSid on the contact endpoint is an anomaly with no transition', async () => {
    const h = createOfflineHarness(accepting);
    const input = startInput(ORG_A);
    await h.orchestrator.start(input);
    const sid = [...h.twilio.calls.keys()][0]!;
    const [first] = h.twilio.callbacksFor(sid, 'ANSWERED_AND_COMPLETED', h.now);
    const foreign = resign(first!, { ...first!.params, CallSid: `CA${'9'.repeat(32)}` });
    expect(await h.deliver(foreign)).toBe('ANOMALY');
    expect(h.sessions.anomalies[0]).toMatchObject({
      kind: 'SECOND_CONTACT_REFERENCE',
      assessment: { action: 'ALERT_AND_REVIEW' },
    });
    expect(h.coordinator.getAttempt(input.attempt)).toMatchObject({
      state: 'ORIGINATION_ACCEPTED',
      providerReference: sid,
    });
    expect(h.twilio.requests.filter((r) => r.path !== '/Calls.json')).toHaveLength(0);
    expect(h.twilio.createRequestCount).toBe(1);
  });

  it('a callback for another organization only reaches that organization’s attempt', async () => {
    const h = createOfflineHarness(accepting);
    const a = startInput(ORG_A);
    const b = startInput(ORG_B);
    await h.orchestrator.start(a);
    await h.orchestrator.start(b);
    const sidB = [...h.twilio.calls.keys()][1]!;
    for (const delivery of h.twilio.callbacksFor(sidB, 'BUSY', h.now)) await h.deliver(delivery);
    expect(h.coordinator.getAttempt(b.attempt)?.state).toBe('CLOSED');
    expect(h.coordinator.getAttempt(a.attempt)?.state).toBe('ORIGINATION_ACCEPTED');
    expect(h.sessions.getLegs(ORG_A, a.attempt.attemptId)).toEqual([]);
  });

  it('unknown token, forged signature and malformed payload have no effect', async () => {
    const h = createOfflineHarness(accepting);
    const input = startInput(ORG_A);
    await h.orchestrator.start(input);
    const sid = [...h.twilio.calls.keys()][0]!;
    const [first] = h.twilio.callbacksFor(sid, 'BUSY', h.now);
    const otherToken = first!.url.replace(/t=[^&]+$/, `t=${'Q'.repeat(43)}`);
    expect(await h.deliver(resign({ ...first!, url: otherToken }, first!.params))).toBe(
      'UNKNOWN_TOKEN',
    );
    expect(await h.deliver({ ...first!, signature: 'forged' })).toBe('UNAUTHENTICATED');
    expect(await h.deliver(resign(first!, { ...first!.params, CallStatus: 'exploded' }))).toBe(
      'QUARANTINED',
    );
    expect(h.sessions.getLegs(ORG_A, input.attempt.attemptId)).toEqual([]);
  });
});

describe('S4 E2E — crash recovery and kill switch', () => {
  it('crash before originating: recovery cancels and terminates the session, zero dial', async () => {
    const h = createOfflineHarness(accepting);
    const input = startInput(ORG_A);
    const original = h.coordinator.originate.bind(h.coordinator);
    h.coordinator.originate = async () => Promise.reject(new Error('process crashed'));
    await expect(h.orchestrator.start(input)).rejects.toThrow('process crashed');
    h.coordinator.originate = original;
    expect(await h.recovery.recoverAfterCrash(ORG_A)).toEqual({
      interruptedToUnknown: 0,
      reconciled: 0,
      sessionsTerminated: 1,
    });
    expect(h.coordinator.getAttempt(input.attempt)?.state).toBe('CANCELED');
    expect(h.twilio.createRequestCount).toBe(0);
  });

  it('crash after send and before CallSid: OUTCOME_UNKNOWN, reconciliation, never redial', async () => {
    let release!: () => void;
    const h = createOfflineHarness({
      ...accepting,
      twilioTransport: (inner) => ({
        async send(request) {
          const response = await inner.send(request);
          if (request.path === '/Calls.json')
            await new Promise<void>((resolve) => (release = resolve));
          return response;
        },
      }),
    });
    const input = startInput(ORG_A);
    const pending = h.orchestrator.start(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.coordinator.getAttempt(input.attempt)?.state).toBe('ORIGINATION_SENT');
    const report = await h.recovery.recoverAfterCrash(ORG_A);
    expect(report).toMatchObject({ interruptedToUnknown: 1, reconciled: 1 });
    // Sem CallSid a consulta é inconclusiva: o FSM volta a OUTCOME_UNKNOWN (nunca rediscagem).
    expect(h.coordinator.getAttempt(input.attempt)?.state).toBe('OUTCOME_UNKNOWN');
    expect(h.twilio.requests.filter((r) => r.method === 'GET')).toHaveLength(0);
    const sid = [...h.twilio.calls.keys()][0]!;
    for (const delivery of h.twilio.callbacksFor(sid, 'NO_ANSWER', h.now))
      await h.deliver(delivery);
    expect(h.coordinator.getAttempt(input.attempt)).toMatchObject({
      state: 'CLOSED',
      providerReference: sid,
    });
    release();
    await pending;
    expect(h.twilio.createRequestCount).toBe(1);
  });

  it('kill switch hangs up the telephony leg first, then terminates the session', async () => {
    const h = createOfflineHarness(accepting);
    const input = startInput(ORG_A);
    await h.orchestrator.start(input);
    const order: string[] = [];
    const twilioBefore = h.twilio.requests.length;
    const millisBefore = h.millis.requests.length;
    expect(await h.recovery.forceEnd(input.attempt)).toBe('ENDED');
    order.push(...h.twilio.requests.slice(twilioBefore).map((r) => `twilio:${r.form?.[0]?.[1]}`));
    order.push(
      ...h.millis.requests.slice(millisBefore).map((r) => `millis:${r.path.split('/').at(-1)}`),
    );
    expect(order).toEqual(['twilio:completed', 'millis:terminate']);
    expect(h.sessions.getPreparation(ORG_A, input.attempt.attemptId)?.sessionState).toBe(
      'TERMINATED',
    );
    expect(h.twilio.createRequestCount).toBe(1);
  });
});
