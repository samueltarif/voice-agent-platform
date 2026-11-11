import { createHash, randomBytes } from 'node:crypto';
import {
  evaluateBudgetReservation,
  type ConversationSessionPort,
  type OutboundBudgetLedger,
  type PlatformGlobalBudgetLedger,
} from '@voice-agent/contracts';
import {
  InMemoryOutboundAttemptStore,
  InMemorySessionAttemptStore,
  OutboundAttemptOriginationCoordinator,
  OutboundSessionCallbackHandler,
  OutboundSessionOrchestrator,
  OutboundSessionRecovery,
  type OutboundSessionGateInput,
  type StartOutboundSessionInput,
  type UnknownValidityPolicy,
} from '@voice-agent/worker';
import { FakeMillisConversationSimulator } from '../../millis/fake-millis-conversation-simulator.js';
import { MillisConversationSessionAdapter } from '../../millis/millis-conversation-session-adapter.js';
import { validateMillisConfig } from '../../millis/millis-config.js';
import {
  FakeTwilioOriginationSimulator,
  FAKE_TWILIO_AUTH_TOKEN,
} from '../../twilio-outbound/fake-twilio-origination-simulator.js';
import type { FakeCallbackDelivery } from '../../twilio-outbound/fake-twilio-callback-script.js';
import {
  createTwilioOutboundCallbackAuthenticator,
  readCallbackTokenFromUrl,
  TwilioAuthToken,
} from '../../twilio-outbound/twilio-outbound-callback-authenticator.js';
import { normalizeTwilioOutboundCallback } from '../../twilio-outbound/twilio-outbound-callback-normalizer.js';
import { TwilioOutboundOriginationAdapter } from '../../twilio-outbound/twilio-outbound-origination-adapter.js';
import type { TwilioRestTransport } from '../../twilio-outbound/twilio-rest-transport.js';
import {
  TEST_CALLER_ID,
  testTwilioConfig,
} from '../../twilio-outbound/twilio-outbound-test-fixtures.js';

/**
 * 008-OF5 (S4) — Harness E2E 100% OFFLINE: adaptadores reais (Twilio S2,
 * Millis S3) sobre os simuladores, e orquestração real do worker. Nenhum
 * socket, HTTP ou SDK. Dados sintéticos; telefones fictícios.
 */
export const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const PUBLISHED_VERSION = '66666666-6666-4666-8666-666666666666';
export const PUBLISHED_CONFIG = { prompt: 'Você é um assistente de testes.', language: 'pt-BR' };

let sequence = 0;
export function syntheticUuid(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

const NOW = new Date('2026-11-11T12:00:00.000Z');
const hasher = { sha256Hex: async (v: string) => createHash('sha256').update(v).digest('hex') };

function ledger(organizationId: string): OutboundBudgetLedger {
  return {
    id: syntheticUuid(),
    organizationId,
    currency: 'USD',
    allocatedBudgetMinorUnits: 1_000,
    reservedAmountMinorUnits: 0,
    spentCarrierMinorUnits: 0,
    spentConversationalMinorUnits: 0,
    spentAmountMinorUnits: 0,
    availableAmountMinorUnits: 1_000,
    maxConcurrentCalls: 1,
    maxDailyAttempts: 10,
    timezone: 'America/Sao_Paulo',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const GLOBAL: PlatformGlobalBudgetLedger = {
  id: 'global',
  currency: 'USD',
  allocatedBudgetMinorUnits: 10_000,
  reservedAmountMinorUnits: 0,
  spentCarrierMinorUnits: 0,
  spentConversationalMinorUnits: 0,
  spentAmountMinorUnits: 0,
  availableAmountMinorUnits: 10_000,
  maxConcurrentCalls: 1,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

export function allowedGate(organizationId: string, requested = 100): OutboundSessionGateInput {
  return {
    organizationId,
    killSwitchEngaged: false,
    agentVersion: { organizationId, status: 'PUBLISHED' },
    entitlementActive: true,
    campaignState: 'ACTIVE',
    destinationSuppressed: false,
    budget: evaluateBudgetReservation({
      globalLedger: GLOBAL,
      globalActiveConcurrentCalls: 0,
      ledger: ledger(organizationId),
      requestedAmountMinorUnits: requested,
      activeConcurrentCalls: 0,
      todayAttemptsCount: 0,
    }),
  };
}

export function startInput(
  organizationId: string,
  jobId = syntheticUuid(),
): StartOutboundSessionInput {
  return {
    attempt: {
      attemptId: syntheticUuid(),
      organizationId,
      jobId,
      correlationId: syntheticUuid(),
      agentId: syntheticUuid(),
      agentVersionId: PUBLISHED_VERSION,
      jobIdempotencyKey: `job-${jobId}`,
      maxAttempts: 3,
    },
    destination: '+5511900000002',
    callerId: TEST_CALLER_ID,
    gate: allowedGate(organizationId),
  };
}

export interface HarnessOptions {
  readonly unknownValidity?: UnknownValidityPolicy;
  readonly twilioTransport?: (inner: TwilioRestTransport) => TwilioRestTransport;
  readonly conversation?: ConversationSessionPort;
  /** Entropia injetada (padrão: `crypto.randomBytes`). */
  readonly randomBytes?: (length: number) => Uint8Array;
}

interface Providers {
  readonly twilio: FakeTwilioOriginationSimulator;
  readonly millis: FakeMillisConversationSimulator;
  readonly twilioAdapter: TwilioOutboundOriginationAdapter;
  readonly millisAdapter: MillisConversationSessionAdapter;
}

const clock = { now: () => NOW, newEventId: syntheticUuid };

function buildProviders(
  options: HarnessOptions,
  holder: { orchestrator?: OutboundSessionOrchestrator },
): Providers {
  const twilio = new FakeTwilioOriginationSimulator();
  const millis = new FakeMillisConversationSimulator();
  const twilioAdapter = new TwilioOutboundOriginationAdapter({
    config: testTwilioConfig(),
    transport: options.twilioTransport ? options.twilioTransport(twilio) : twilio,
    resolveDialContext: (request) => holder.orchestrator!.takeDialContext(request),
  });
  const millisAdapter = new MillisConversationSessionAdapter({
    config: validateMillisConfig({ enabled: true, region: 'us-west', requestTimeoutMs: 5_000 }),
    transport: millis,
    resolvePublishedAgent: async (request) =>
      request.agentVersionId === PUBLISHED_VERSION ? { agentConfig: PUBLISHED_CONFIG } : null,
  });
  return { twilio, millis, twilioAdapter, millisAdapter };
}

function createDeliver(handler: OutboundSessionCallbackHandler) {
  const authenticator = createTwilioOutboundCallbackAuthenticator(
    new TwilioAuthToken(FAKE_TWILIO_AUTH_TOKEN),
  );
  return async function deliver(delivery: FakeCallbackDelivery): Promise<string> {
    const auth = await authenticator.authenticate({
      provider: 'twilio',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': delivery.signature,
      },
      rawBody: new URLSearchParams(delivery.params).toString(),
      receivedAt: NOW,
      url: delivery.url,
    });
    if (auth.kind !== 'AUTHENTICATED') return 'UNAUTHENTICATED';
    return handler.receive({
      callbackToken: readCallbackTokenFromUrl(delivery.url) ?? '',
      normalize: (attempt) =>
        normalizeTwilioOutboundCallback({
          endpoint: delivery.endpoint,
          params: delivery.params,
          attempt,
          receivedAt: NOW,
        }),
    });
  };
}

export function createOfflineHarness(options: HarnessOptions = {}) {
  const holder: { orchestrator?: OutboundSessionOrchestrator } = {};
  const providers = buildProviders(options, holder);
  const attempts = new InMemoryOutboundAttemptStore();
  const sessions = new InMemorySessionAttemptStore();
  const coordinator = new OutboundAttemptOriginationCoordinator({
    store: attempts,
    origination: providers.twilioAdapter,
    reconciliation: providers.twilioAdapter,
    authorityId: 'twilio-outbound',
    ...clock,
  });
  const orchestrator = new OutboundSessionOrchestrator({
    coordinator,
    conversation: options.conversation ?? providers.millisAdapter,
    store: sessions,
    entropy: { randomBytes: options.randomBytes ?? ((n) => randomBytes(n)) },
    hasher,
    unknownValidity: options.unknownValidity ?? 'REFUSE',
    now: clock.now,
  });
  holder.orchestrator = orchestrator;
  const handler = new OutboundSessionCallbackHandler({
    coordinator,
    orchestrator,
    store: sessions,
    hasher,
    ...clock,
  });
  const callControl = providers.twilioAdapter;
  const recovery = new OutboundSessionRecovery({
    coordinator,
    orchestrator,
    store: sessions,
    callControl,
  });
  const { twilio, millis } = providers;
  const deliver = createDeliver(handler);
  return {
    twilio,
    millis,
    attempts,
    sessions,
    coordinator,
    orchestrator,
    recovery,
    deliver,
    now: NOW,
  };
}
