import { describe, expect, it } from 'vitest';
import {
  ApiListenConfigError,
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  resolveApiListenOptions,
} from './server-listen-options.js';

describe('resolveApiListenOptions', () => {
  it('listens only on loopback by default', () => {
    expect(resolveApiListenOptions({})).toEqual({
      hostname: DEFAULT_API_HOST,
      port: DEFAULT_API_PORT,
    });
    expect(DEFAULT_API_HOST).toBe('127.0.0.1');
    expect(resolveApiListenOptions({ HOST: '  ', PORT: '' }).hostname).toBe('127.0.0.1');
  });

  it('accepts an explicit host and port', () => {
    expect(resolveApiListenOptions({ HOST: '127.0.0.1', PORT: '3007' })).toEqual({
      hostname: '127.0.0.1',
      port: 3007,
    });
    expect(resolveApiListenOptions({ PORT: '0' }).port).toBe(0);
  });

  it('refuses all-interfaces binding unless explicitly allowed', () => {
    for (const HOST of ['0.0.0.0', '::', '[::]', '*']) {
      expect(() => resolveApiListenOptions({ HOST })).toThrow(ApiListenConfigError);
      expect(() => resolveApiListenOptions({ HOST, API_ALLOW_PUBLIC_BIND: 'yes' })).toThrow();
    }
    expect(
      resolveApiListenOptions({ HOST: '0.0.0.0', API_ALLOW_PUBLIC_BIND: 'true' }).hostname,
    ).toBe('0.0.0.0');
  });

  it('rejects invalid ports', () => {
    for (const PORT of ['abc', '-1', '65536', '30.5']) {
      expect(() => resolveApiListenOptions({ PORT })).toThrow(ApiListenConfigError);
    }
  });
});
