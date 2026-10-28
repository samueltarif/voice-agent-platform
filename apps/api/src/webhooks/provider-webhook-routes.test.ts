import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  failClosedWebhookAuthenticator,
  type ProviderWebhookAuthenticator,
  type ToolPort,
} from '@voice-agent/contracts';
import type { ProviderAttemptResolution } from '@voice-agent/database';
import type { Logger } from '@voice-agent/logger';
import { deriveProviderEventId } from './provider-event-identity.js';
import type { ProviderWebhookDependencies } from './provider-webhook-ports.js';
import {
  PROVIDER_WEBHOOK_MAX_BODY_BYTES,
  registerProviderWebhookRoutes,
} from './provider-webhook-routes.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const LIVE: ProviderAttemptResolution = {
  kind: 'RESOLVED',
  attempt: {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: ORG,
    jobId: '33333333-3333-4333-8333-333333333333',
    state: 'ORIGINATION_ACCEPTED',
    agentId: '44444444-4444-4444-8444-444444444444',
    agentVersionId: '55555555-5555-4555-8555-555555555555',
    callSessionId: null,
  },
};
const accept: ProviderWebhookAuthenticator = {
  authenticate: async () => ({ kind: 'AUTHENTICATED' }),
};

function harness(
  overrides: Partial<ProviderWebhookDependencies> & { auth?: ProviderWebhookAuthenticator } = {},
) {
  const logs: Array<[string, Record<string, unknown> | undefined]> = [];
  const record = (m: string, c?: Record<string, unknown>) => void logs.push([m, c]);
  const logger: Logger = { info: record, warn: record, error: record, debug: record };
  const app = new Hono();
  registerProviderWebhookRoutes(app, {
    providers: new Map([
      [
        'fake',
        {
          authenticator: overrides.auth ?? accept,
          normalizer: { normalize: (r) => JSON.parse(r.rawBody) },
        },
      ],
    ]),
    store: {
      resolveByProviderReference: async () => LIVE,
      applyProviderEvent: async () => ({ kind: 'NOT_FOUND' }),
    },
    tools: { executeTool: async (i) => ({ status: 'SUCCESS', toolName: i.toolName, output: 1 }) },
    toolTimeoutMs: 50,
    logger,
    now: () => new Date(),
    ...overrides,
  });
  const post = (channel: string, body: string) =>
    app.request(`/v1/provider-webhooks/fake/${channel}`, { method: 'POST', body });
  return { post, logs };
}

const tool = JSON.stringify({
  kind: 'TOOL_INVOCATION',
  providerEventId: null,
  providerCallReference: 'CA-secret-ref',
  occurredAt: '2026-10-28T12:00:00.000Z',
  toolName: 'operating_hours',
  invocationId: 'inv-1',
  arguments: {},
});

describe('008-OF4 provider webhook routes (offline fakes)', () => {
  it('rejects every delivery with the default fail-closed authenticator', async () => {
    const { post } = harness({ auth: failClosedWebhookAuthenticator });
    expect((await post('tools', tool)).status).toBe(401);
  });

  it('refuses oversized bodies before parsing', async () => {
    const { post } = harness();
    const response = await post('events', 'x'.repeat(PROVIDER_WEBHOOK_MAX_BODY_BYTES + 1));
    expect(response.status).toBe(413);
  });

  it('rejects malformed payloads and events sent to the wrong channel', async () => {
    const { post } = harness();
    expect((await post('events', tool)).status).toBe(400);
    expect((await post('tools', JSON.stringify({ kind: 'TOOL_INVOCATION' }))).status).toBe(400);
  });

  it('fails closed with TIMEOUT when a tool exceeds the internal limit', async () => {
    const hang: ToolPort = { executeTool: () => new Promise(() => undefined) };
    const started = Date.now();
    const response = await harness({ tools: hang }).post('tools', tool);
    expect(await response.json()).toMatchObject({ status: 'FAILED', reason: 'TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('maps synchronous and late tool failures to a logged FAILED result, never a 5xx', async () => {
    const boom: ToolPort = {
      executeTool: () => {
        throw new TypeError('internal detail');
      },
    };
    const { post, logs } = harness({ tools: boom });
    const response = await post('tools', tool);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'FAILED', reason: 'EXECUTION_FAILED' });
    expect(
      logs.some(
        ([m, c]) => m === 'provider_webhook.tool_execution_failed' && c?.errorName === 'TypeError',
      ),
    ).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('internal detail');
  });

  it('never logs the opaque provider reference in clear text', async () => {
    const { post, logs } = harness({
      store: {
        resolveByProviderReference: async () => ({ kind: 'UNKNOWN' }),
        applyProviderEvent: vi.fn(),
      },
    });
    await post('tools', tool);
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('CA-secret-ref');
  });
});

describe('provider event identity', () => {
  it('derives a stable RFC-variant UUID per delivery key', () => {
    const event = JSON.parse(tool);
    const id = deriveProviderEventId('fake', event);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deriveProviderEventId('fake', event)).toBe(id);
    expect(deriveProviderEventId('other', event)).not.toBe(id);
  });
});
