import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  failClosedWebhookAuthenticator,
  type PostCallReport,
  type ProviderWebhookAuthenticator,
} from '@voice-agent/contracts';
import type { PostCallAttempt, ProviderAttemptResolution } from '@voice-agent/database';
import type { Logger } from '@voice-agent/logger';
import type { ProviderWebhookDependencies } from './provider-webhook-ports.js';
import {
  PROVIDER_SESSION_REPORT_MAX_BODY_BYTES,
  PROVIDER_WEBHOOK_MAX_BODY_BYTES,
  registerProviderWebhookRoutes,
} from './provider-webhook-routes.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const RESOLVED: ProviderAttemptResolution = {
  kind: 'RESOLVED',
  attempt: {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: ORG,
    jobId: '33333333-3333-4333-8333-333333333333',
    state: 'CLOSED',
    agentId: '44444444-4444-4444-8444-444444444444',
    agentVersionId: '55555555-5555-4555-8555-555555555555',
    callSessionId: '66666666-6666-4666-8666-666666666666',
  },
};
const accept: ProviderWebhookAuthenticator = {
  authenticate: async () => ({ kind: 'AUTHENTICATED' }),
};
const REPORT: PostCallReport = {
  ordering: 'TIMELINE',
  entries: [{ kind: 'LEAD', text: 'Alô?' }],
  endReason: 'INACTIVITY_TIMEOUT',
  durationSeconds: 96,
};
const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    kind: 'SESSION_REPORT',
    providerEventId: null,
    providerCallReference: 'ref-1',
    occurredAt: '2026-11-30T12:05:00.000Z',
    report: REPORT,
    ...extra,
  });

function harness(
  options: {
    auth?: ProviderWebhookAuthenticator;
    resolution?: ProviderAttemptResolution;
    withReports?: boolean;
  } = {},
) {
  const ingested: Array<[PostCallAttempt, PostCallReport]> = [];
  const noop = () => undefined;
  const logger: Logger = { info: noop, warn: noop, error: noop, debug: noop };
  const deps: ProviderWebhookDependencies = {
    providers: new Map([
      [
        'fake',
        {
          authenticator: options.auth ?? accept,
          normalizer: { normalize: (r) => JSON.parse(r.rawBody) },
        },
      ],
    ]),
    store: {
      resolveByProviderReference: async () => options.resolution ?? RESOLVED,
      applyProviderEvent: async () => ({ kind: 'NOT_FOUND' }),
    },
    tools: { executeTool: async () => ({ status: 'SUCCESS', toolName: 'x', output: null }) },
    toolTimeoutMs: 50,
    logger,
    now: () => new Date(),
    ...(options.withReports === false
      ? {}
      : {
          reports: {
            ingest: async (attempt, report) => {
              ingested.push([attempt, report]);
              return { status: 'RECONCILED', reasons: [] };
            },
          },
        }),
  };
  const app = new Hono();
  registerProviderWebhookRoutes(app, deps);
  const post = (channel: string, payload: string) =>
    app.request(`/v1/provider-webhooks/fake/${channel}`, { method: 'POST', body: payload });
  return { post, ingested };
}

/** DEC-077 — canal do relatório pós-chamada no pipeline de webhooks (offline; rota não montada). */
describe('provider session reports', () => {
  it('authenticates, resolves the attempt server-side and hands the normalized report over', async () => {
    const { post, ingested } = harness();
    const response = await post('session-reports', body());
    expect(response.status).toBe(200);
    expect(ingested).toEqual([
      [
        {
          organizationId: ORG,
          attemptId: RESOLVED.kind === 'RESOLVED' ? RESOLVED.attempt.id : '',
          jobId: '33333333-3333-4333-8333-333333333333',
          callSessionId: '66666666-6666-4666-8666-666666666666',
          agentId: '44444444-4444-4444-8444-444444444444',
          agentVersionId: '55555555-5555-4555-8555-555555555555',
        },
        REPORT,
      ],
    ]);
  });

  it('fails closed: unauthenticated, tenant fields, wrong channel or unknown call have no effect', async () => {
    expect(
      (await harness({ auth: failClosedWebhookAuthenticator }).post('session-reports', body()))
        .status,
    ).toBe(401);
    const strict = harness();
    expect((await strict.post('session-reports', body({ organizationId: ORG }))).status).toBe(400);
    expect((await strict.post('tools', body())).status).toBe(400);
    expect(strict.ingested).toHaveLength(0);
    for (const resolution of [{ kind: 'UNKNOWN' }, { kind: 'AMBIGUOUS' }] as const) {
      const unknown = harness({ resolution });
      const response = await unknown.post('session-reports', body());
      expect([resolution.kind, response.status]).toEqual([resolution.kind, 202]);
      expect(unknown.ingested).toHaveLength(0);
    }
    expect((await harness({ withReports: false }).post('session-reports', body())).status).toBe(
      202,
    );
  });

  it('accepts a full history up to its own larger body limit only', async () => {
    const big = body({
      report: { ...REPORT, entries: [{ kind: 'AGENT', text: 'x'.repeat(4000) }] },
    });
    expect(big.length).toBeGreaterThan(PROVIDER_WEBHOOK_MAX_BODY_BYTES / 16);
    expect((await harness().post('session-reports', big)).status).toBe(200);
    const huge = 'x'.repeat(PROVIDER_SESSION_REPORT_MAX_BODY_BYTES + 1);
    expect((await harness().post('session-reports', huge)).status).toBe(413);
  });
});
