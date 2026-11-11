import { describe, expect, it, vi } from 'vitest';
import { createFetchMillisTransport, isAllowedMillisPath } from './millis-http-transport.js';
import {
  MillisApiKey,
  MillisConfigError,
  MillisDisabledError,
  validateMillisConfig,
} from './millis-config.js';
import {
  decodeMillisSessionId,
  encodeMillisSessionRef,
  parseRegisterSipCallResponse,
} from './millis-register-sip-call.js';

const apiKey = new MillisApiKey('test-key-0123456789abcdef');
const config = validateMillisConfig({ enabled: true, region: 'eu-west', requestTimeoutMs: 5_000 });

describe('S3 — Millis transport (injected fetch, never real network)', () => {
  it('only the three documented operations are allowed', () => {
    expect(isAllowedMillisPath('/register_sip_call')).toBe(true);
    expect(isAllowedMillisPath('/sessions/sess_1/terminate')).toBe(true);
    expect(isAllowedMillisPath('/call-logs/sess_1')).toBe(true);
    for (const path of [
      '/start_outbound_call',
      '/agents',
      '/call-logs/../agents',
      '/sessions/a%2Fb/terminate',
      '/call-logs/',
    ]) {
      expect(isAllowedMillisPath(path)).toBe(false);
    }
  });

  it('refuses when disabled or for other paths, without calling fetch', async () => {
    const fetchFn = vi.fn();
    const disabled = createFetchMillisTransport({
      config: { ...config, enabled: false },
      apiKey,
      fetchFn,
    });
    await expect(disabled.send({ method: 'POST', path: '/register_sip_call' })).rejects.toThrow(
      MillisDisabledError,
    );
    const enabled = createFetchMillisTransport({ config, apiKey, fetchFn });
    await expect(enabled.send({ method: 'POST', path: '/start_outbound_call' })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the documented regional base URL and authorization header', async () => {
    const fetchFn = vi.fn(async () => new Response('{"call_id":"c"}', { status: 200 }));
    const transport = createFetchMillisTransport({ config, apiKey, fetchFn });
    expect(
      await transport.send({ method: 'POST', path: '/register_sip_call', body: { a: 1 } }),
    ).toEqual({
      kind: 'HTTP',
      status: 200,
      body: { call_id: 'c' },
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api-eu-west.millis.ai/register_sip_call');
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'test-key-0123456789abcdef',
    );
    expect(init.body).toBe('{"a":1}');
  });

  it('never exposes the API key and validates configuration', () => {
    expect(String(apiKey)).not.toContain('0123456789');
    expect(JSON.stringify({ apiKey })).not.toContain('0123456789');
    expect(() => new MillisApiKey('short')).toThrow(MillisConfigError);
    expect(() => validateMillisConfig({ ...config, region: 'sa-east' as never })).toThrow(
      MillisConfigError,
    );
    expect(() => validateMillisConfig({ ...config, requestTimeoutMs: 60_000 })).toThrow(
      MillisConfigError,
    );
  });
});

describe('S3 — register_sip_call response parsing and session reference', () => {
  it.each([
    [{ call_id: 'c1', sip_uri: 'sip:a@b.test' }, 'REGISTERED'],
    [{ call_id: 'c1', sip: 'sip:a@b.test', session_id: 's1' }, 'REGISTERED'],
    [{ call_id: 'c1', sip_uri: 'sip:a@b.test', sip: 'sip:a@b.test' }, 'REGISTERED'],
    [{ call_id: 'c1', sip_uri: 'sip:a@b.test', sip: 'sip:z@b.test' }, 'UNUSABLE'],
    [{ call_id: 'c1', sip_uri: 'sips:a@b.test' }, 'UNUSABLE'],
    [{ call_id: 'c1', sip_uri: 'sip:a@b.test;transport=tcp' }, 'UNUSABLE'],
    [{ call_id: 'c1', sip_uri: 42 }, 'UNUSABLE'],
    [{ call_id: '../x', sip_uri: 'sip:a@b.test' }, 'UNREADABLE'],
    [{ session_id: 's1' }, 'UNUSABLE'],
    [null, 'UNREADABLE'],
    ['text', 'UNREADABLE'],
  ] as const)('%j → %s', (body, kind) => {
    expect(parseRegisterSipCallResponse(body).kind).toBe(kind);
  });

  it('session reference round-trips the session id and stays ≤ 128 chars', () => {
    const ref = encodeMillisSessionRef({
      callId: 'call_1',
      sessionId: 'sess_1',
      sipUri: 'sip:a@b.test',
    })!;
    expect(ref.length).toBeLessThanOrEqual(128);
    expect(decodeMillisSessionId(ref)).toBe('sess_1');
    expect(
      decodeMillisSessionId(
        encodeMillisSessionRef({ callId: 'c', sessionId: null, sipUri: 'sip:a@b.test' })!,
      ),
    ).toBeNull();
    expect(
      encodeMillisSessionRef({
        callId: 'c'.repeat(128),
        sessionId: 's'.repeat(128),
        sipUri: 'sip:a@b.test',
      }),
    ).toBeNull();
  });
});
