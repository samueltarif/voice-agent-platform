import { describe, it, expect } from 'vitest';
import {
  CALLBACK_TOKEN_BYTES,
  CALLBACK_TOKEN_REDACTED,
  CallbackToken,
  callbackTokenHashesMatch,
  generateCallbackToken,
  hashCallbackToken,
  type CallbackTokenEntropySource,
} from './callback-token.js';

/** Fonte de teste determinística (NÃO é CSPRNG; a real é ligada na S4). */
function sequenceSource(seed: number): CallbackTokenEntropySource {
  return {
    randomBytes: (length) => Uint8Array.from({ length }, (_v, i) => (seed * 31 + i * 7) & 0xff),
  };
}

const fakeHasher = {
  sha256Hex: async (value: string) => value.length.toString(16).padStart(64, '0'),
};

describe('callback token (D-CB-TOKEN)', () => {
  it('uses at least 128 bits of entropy (32 bytes) and a fixed base64url format', () => {
    expect(CALLBACK_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128);
    const requested: number[] = [];
    const token = generateCallbackToken({
      randomBytes: (n) => {
        requested.push(n);
        return sequenceSource(1).randomBytes(n);
      },
    });
    expect(requested).toEqual([32]);
    expect(token.reveal()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('encodes bytes losslessly (different inputs never collide)', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 256; seed += 1)
      seen.add(generateCallbackToken(sequenceSource(seed)).reveal());
    expect(seen.size).toBe(256);
    const zeros = generateCallbackToken({ randomBytes: (n) => new Uint8Array(n) });
    expect(zeros.reveal()).toBe('A'.repeat(43));
  });

  it('refuses an entropy source that returns fewer bytes or a non-byte array', () => {
    expect(() => generateCallbackToken({ randomBytes: () => new Uint8Array(16) })).toThrow();
    expect(() =>
      generateCallbackToken({ randomBytes: () => [1, 2, 3] as unknown as Uint8Array }),
    ).toThrow();
  });

  it('never exposes the value through string conversion, JSON or inspection', () => {
    const token = generateCallbackToken(sequenceSource(7));
    expect(String(token)).toBe(CALLBACK_TOKEN_REDACTED);
    expect(`${token}`).toBe(CALLBACK_TOKEN_REDACTED);
    expect(JSON.stringify({ token })).toBe(`{"token":"${CALLBACK_TOKEN_REDACTED}"}`);
    expect(JSON.stringify({ ...token })).not.toContain(token.reveal());
    const inspect = (token as unknown as Record<symbol, () => string>)[
      Symbol.for('nodejs.util.inspect.custom')
    ]!;
    expect(inspect.call(token)).toBe(CALLBACK_TOKEN_REDACTED);
  });

  it('parses only well-formed tokens', () => {
    expect(() => CallbackToken.fromString('curto')).toThrow();
    expect(() => CallbackToken.fromString(`${'A'.repeat(42)}=`)).toThrow();
    expect(CallbackToken.fromString('A'.repeat(43)).reveal()).toBe('A'.repeat(43));
  });

  it('persists only a validated SHA-256 hex hash and compares hashes in constant time', async () => {
    const token = generateCallbackToken(sequenceSource(3));
    const hash = await hashCallbackToken(token, fakeHasher);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(hashCallbackToken(token, { sha256Hex: async () => 'not-hex' })).rejects.toThrow();
    expect(callbackTokenHashesMatch(hash, hash)).toBe(true);
    const lastChar = hash.at(-1) === '0' ? '1' : '0';
    expect(callbackTokenHashesMatch(hash, `${hash.slice(0, 63)}${lastChar}`)).toBe(false);
    expect(callbackTokenHashesMatch(hash, hash.slice(1))).toBe(false);
  });
});
