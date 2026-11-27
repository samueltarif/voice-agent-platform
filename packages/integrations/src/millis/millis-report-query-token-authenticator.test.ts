import { describe, expect, it } from 'vitest';
import type { ProviderWebhookRequest } from '@voice-agent/contracts';
import { createMillisReportQueryTokenAuthenticator } from './millis-report-query-token-authenticator.js';

const SECRET = 's'.repeat(40);
const request = (
  query: Record<string, string> | undefined,
  headers: Record<string, string> = {},
): ProviderWebhookRequest => ({
  provider: 'millis',
  headers,
  rawBody: '{}',
  receivedAt: new Date(),
  ...(query ? { query } : {}),
});

describe('Millis report query-token authenticator (only the observed mechanism)', () => {
  const auth = createMillisReportQueryTokenAuthenticator({ secret: SECRET });

  it('accepts the exact token in the URL parameter', async () => {
    expect(await auth.authenticate(request({ t: SECRET }))).toEqual({ kind: 'AUTHENTICATED' });
  });

  it('rejects a wrong or missing token', async () => {
    expect(await auth.authenticate(request({ t: `${SECRET}x` }))).toEqual({
      kind: 'REJECTED',
      reason: 'INVALID_CREDENTIALS',
    });
    expect(await auth.authenticate(request(undefined))).toEqual({
      kind: 'REJECTED',
      reason: 'MISSING_CREDENTIALS',
    });
  });

  it('does not accept the token from headers (header auth not proven)', async () => {
    const viaHeaders = request({}, { t: SECRET, authorization: `Bearer ${SECRET}` });
    expect(await auth.authenticate(viaHeaders)).toEqual({
      kind: 'REJECTED',
      reason: 'MISSING_CREDENTIALS',
    });
  });

  it('fails closed without a strong secret', async () => {
    for (const secret of [undefined, '', 'short']) {
      const weak = createMillisReportQueryTokenAuthenticator({ secret });
      expect(await weak.authenticate(request({ t: secret ?? 'x' }))).toEqual({
        kind: 'REJECTED',
        reason: 'NOT_CONFIGURED',
      });
    }
  });
});
