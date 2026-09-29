import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVoiceGatewayConfig } from '@voice-agent/config';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  CallBootstrapExpiredError,
  InvalidProviderBindingError,
  ProviderAuthenticationError,
} from '@voice-agent/errors';
import {
  CallLifecycleGateway,
  InMemoryCallBootstrapRegistry,
  InMemoryCallSessionStore,
} from '@voice-agent/voice';
import { buildTwilioSignaturePayload } from './twilio-signature-validator.js';
import { handleTwilioVoiceWebhook } from './twilio-voice-webhook-handler.js';

describe('Twilio Voice Webhook Entrypoint Handler', () => {
  const syntheticAuthToken = 'synth_auth_token_999';
  const config = createVoiceGatewayConfig({
    publicVoiceBaseUrl: 'https://voice.example.com',
    conversationRelayPath: '/v1/twilio/conversation-relay',
    bootstrapTtlMs: 60_000,
  });

  let registry: InMemoryCallBootstrapRegistry;
  let sessionStore: InMemoryCallSessionStore;
  let gateway: CallLifecycleGateway;

  const mockSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Teste',
      objective: 'Atender clientes com rapidez',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Tchau!',
      fallbackPhrase: 'Poderia repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja conciso'], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  };

  function signRequest(url: string, params?: Record<string, string>): string {
    const payload = buildTwilioSignaturePayload(url, params);
    return createHmac('sha1', syntheticAuthToken).update(payload, 'utf8').digest('base64');
  }

  beforeEach(() => {
    registry = new InMemoryCallBootstrapRegistry();
    sessionStore = new InMemoryCallSessionStore();
    gateway = new CallLifecycleGateway({
      bootstrapRegistry: registry,
      sessionStore,
    });
  });

  it('accepts valid signed webhook and returns 200 with ConversationRelay TwiML', async () => {
    const bootstrap = await gateway.prepareCall({
      organizationId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      agentVersionId: '00000000-0000-0000-0000-000000000003',
      agentSnapshot: mockSnapshot,
      agentVersionStatus: 'PUBLISHED',
    });

    const path = '/v1/twilio/voice/webhook';
    const query = { bootstrapId: bootstrap.bootstrapId };
    const body = { CallSid: 'CA12345', From: '+551199999999' };
    const canonicalUrl = `https://voice.example.com${path}?bootstrapId=${bootstrap.bootstrapId}`;
    const validSignature = signRequest(canonicalUrl, body);

    const res = await handleTwilioVoiceWebhook(
      {
        method: 'POST',
        path,
        headers: { 'x-twilio-signature': validSignature },
        query,
        body,
      },
      { gateway, config, authToken: syntheticAuthToken },
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('application/xml');
    expect(res.body).toContain('<ConversationRelay');
    expect(res.body).toContain('url="wss://voice.example.com/v1/twilio/conversation-relay"');
    expect(res.body).toContain(`<Parameter name="bootstrapId" value="${bootstrap.bootstrapId}" />`);
  });

  it('rejects request with missing or invalid signature', async () => {
    const req = {
      method: 'POST',
      path: '/v1/twilio/voice/webhook',
      headers: {},
      query: { bootstrapId: '00000000-0000-0000-0000-000000000001' },
    };

    await expect(
      handleTwilioVoiceWebhook(req, { gateway, config, authToken: syntheticAuthToken }),
    ).rejects.toThrow(ProviderAuthenticationError);

    await expect(
      handleTwilioVoiceWebhook(
        { ...req, headers: { 'x-twilio-signature': 'invalid_signature_base64=' } },
        { gateway, config, authToken: syntheticAuthToken },
      ),
    ).rejects.toThrow(ProviderAuthenticationError);
  });

  it('ignores forged Host and X-Forwarded headers during signature verification', async () => {
    const bootstrap = await gateway.prepareCall({
      organizationId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      agentVersionId: '00000000-0000-0000-0000-000000000003',
      agentSnapshot: mockSnapshot,
      agentVersionStatus: 'PUBLISHED',
    });

    const path = '/v1/twilio/voice/webhook';
    const query = { bootstrapId: bootstrap.bootstrapId };
    const canonicalUrl = `https://voice.example.com${path}?bootstrapId=${bootstrap.bootstrapId}`;
    const validSignature = signRequest(canonicalUrl);

    // Attacker sends forged headers
    const res = await handleTwilioVoiceWebhook(
      {
        method: 'POST',
        path,
        headers: {
          'x-twilio-signature': validSignature,
          host: 'attacker.evil.com',
          'x-forwarded-host': 'phishing.fake.net',
          'x-forwarded-proto': 'http',
        },
        query,
      },
      { gateway, config, authToken: syntheticAuthToken },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(bootstrap.bootstrapId);
  });

  it('rejects missing or invalid bootstrapId format', async () => {
    const path = '/webhook';
    const canonicalUrl = `https://voice.example.com${path}`;
    const sig = signRequest(canonicalUrl);

    await expect(
      handleTwilioVoiceWebhook(
        { method: 'POST', path, headers: { 'x-twilio-signature': sig } },
        { gateway, config, authToken: syntheticAuthToken },
      ),
    ).rejects.toThrow(InvalidProviderBindingError);
  });

  it('rejects expired or consumed bootstrap tokens', async () => {
    const bootstrap = await gateway.prepareCall({
      organizationId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      agentVersionId: '00000000-0000-0000-0000-000000000003',
      agentSnapshot: mockSnapshot,
      agentVersionStatus: 'PUBLISHED',
      ttlMs: 1_000,
    });

    const path = '/webhook';
    const query = { bootstrapId: bootstrap.bootstrapId };
    const canonicalUrl = `https://voice.example.com${path}?bootstrapId=${bootstrap.bootstrapId}`;
    const sig = signRequest(canonicalUrl);

    const futureDate = new Date(Date.now() + 5_000);
    await expect(
      handleTwilioVoiceWebhook(
        { method: 'POST', path, headers: { 'x-twilio-signature': sig }, query },
        { gateway, config, authToken: syntheticAuthToken },
        futureDate,
      ),
    ).rejects.toThrow(CallBootstrapExpiredError);
  });
});
