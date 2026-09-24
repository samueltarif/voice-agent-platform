import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK, type JSONWebKeySet } from 'jose';
import {
  ServiceAssertionVerifier,
  MAX_ASSERTION_LIFETIME_SECONDS,
  DEFAULT_CLOCK_TOLERANCE_SECONDS,
} from './service-assertion-verifier.js';
import { AuthenticationError } from '@voice-agent/errors';

describe('ServiceAssertionVerifier', () => {
  let privateJwk: JWK;
  let publicJwk: JWK;
  let publicJwks: JSONWebKeySet;
  const kid = 'test-key-id-1';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sub = 'usr_operator_123';

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;
    publicJwks = { keys: [publicJwk] };
  });

  async function createTestAssertion(
    overrides: {
      header?: Record<string, unknown>;
      claims?: Record<string, unknown>;
      signingKey?: JWK;
      ttlSeconds?: number;
      clockToleranceOffset?: number;
      skewNowSeconds?: number;
    } = {},
  ): Promise<string> {
    const now = overrides.skewNowSeconds ?? Math.floor(Date.now() / 1000);
    const ttl = overrides.ttlSeconds ?? 30;
    const { importJWK } = await import('jose');
    const importedKey = await importJWK(overrides.signingKey ?? privateJwk, 'EdDSA');

    const defaultClaims = {
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + ttl,
      jti: 'jti-assertion-uuid-1',
    };

    const payload = { ...defaultClaims, ...overrides.claims };
    const header = {
      alg: 'EdDSA',
      kid,
      typ: 'JWT',
      ...overrides.header,
    };

    return new SignJWT(payload).setProtectedHeader(header).sign(importedKey);
  }

  // 1. valid assertion accepted
  it('1. accepts a valid EdDSA signed service assertion', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion();
    const verified = await verifier.verify(token);

    expect(verified.sub).toBe(sub);
    expect(verified.orgId).toBe(orgId);
    expect(verified.iss).toBe('voice-agent:web');
    expect(verified.aud).toBe('voice-agent:api');
    expect(typeof verified.iat).toBe('number');
    expect(typeof verified.exp).toBe('number');
    expect(verified.exp - verified.iat).toBe(30);
  });

  // 2. signature tampered rejected
  it('2. rejects assertion when signature is tampered', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion();
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacked' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    await expect(verifier.verify(tamperedToken)).rejects.toThrow(AuthenticationError);
  });

  // 3. wrong public key rejected
  it('3. rejects assertion signed with unknown private key', async () => {
    const otherKeyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const otherPrivateJwk = await exportJWK(otherKeyPair.privateKey);
    otherPrivateJwk.kid = kid; // same kid, different key

    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ signingKey: otherPrivateJwk });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 4. wrong alg rejected (e.g. HS256, RS256)
  it('4. rejects assertion using non-EdDSA algorithm', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const rsaKeys = await generateKeyPair('RS256');
    const rsaToken = await new SignJWT({
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: 'jti-rsa-test',
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .sign(rsaKeys.privateKey);

    await expect(verifier.verify(rsaToken)).rejects.toThrow("Invalid algorithm 'RS256'");
  });

  // 5. missing alg rejected/malformed
  it('5. rejects assertion with missing alg parameter in header', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const headerWithoutAlg = Buffer.from(JSON.stringify({ kid, typ: 'JWT' })).toString('base64url');
    const validToken = await createTestAssertion();
    const parts = validToken.split('.');
    const forgedToken = `${headerWithoutAlg}.${parts[1]}.${parts[2]}`;

    await expect(verifier.verify(forgedToken)).rejects.toThrow("Invalid algorithm 'undefined'");
  });

  // 6. missing kid rejected
  it('6. rejects assertion with missing kid header', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ header: { kid: undefined } });

    await expect(verifier.verify(token)).rejects.toThrow('missing required kid parameter');
  });

  // 7. unknown kid rejected
  it('7. rejects assertion with kid not in configured JWKS', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ header: { kid: 'non-existent-kid' } });

    await expect(verifier.verify(token)).rejects.toThrow(
      "Unknown key identifier 'non-existent-kid'",
    );
  });

  // 8. missing typ rejected
  it('8. rejects assertion with missing typ header', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ header: { typ: undefined } });

    await expect(verifier.verify(token)).rejects.toThrow(
      "Invalid token typ 'undefined', expected 'JWT'",
    );
  });

  // 9. wrong typ rejected
  it('9. rejects assertion with invalid typ parameter', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ header: { typ: 'JOSE' } });

    await expect(verifier.verify(token)).rejects.toThrow(
      "Invalid token typ 'JOSE', expected 'JWT'",
    );
  });

  // 10. wrong issuer rejected
  it('10. rejects assertion with mismatched issuer', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { iss: 'voice-agent:rogue-service' } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 11. wrong audience rejected
  it('11. rejects assertion with mismatched audience', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { aud: 'voice-agent:other-api' } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 12. expired assertion rejected
  it('12. rejects assertion when current time is past exp + clockTolerance', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const baseNow = 1700000000;
    const token = await createTestAssertion({ skewNowSeconds: baseNow, ttlSeconds: 30 });

    // current time is 36 seconds later (exp = baseNow + 30, tolerance = 5, total max = 35)
    await expect(verifier.verify(token, baseNow + 36)).rejects.toThrow(AuthenticationError);
  });

  // 13. future iat beyond 5s tolerance rejected
  it('13. rejects assertion with iat too far in the future', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const baseNow = 1700000000;
    // iat is 6 seconds in future (tolerance is 5 seconds)
    const token = await createTestAssertion({
      claims: { iat: baseNow + 6, exp: baseNow + 36 },
      skewNowSeconds: baseNow + 6,
    });

    await expect(verifier.verify(token, baseNow)).rejects.toThrow('too far in the future');
  });

  // 14. exp <= iat rejected
  it('14. rejects assertion where exp <= iat', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const baseNow = 1700000000;
    const token = await createTestAssertion({
      claims: { iat: baseNow, exp: baseNow },
      skewNowSeconds: baseNow,
    });

    await expect(verifier.verify(token, baseNow)).rejects.toThrow('must be greater than iat');
  });

  // 15. exp - iat > 30 rejected
  it('15. rejects assertion where lifetime exceeds MAX_ASSERTION_LIFETIME_SECONDS (30s)', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const baseNow = 1700000000;
    const token = await createTestAssertion({
      claims: { iat: baseNow, exp: baseNow + 31 },
      skewNowSeconds: baseNow,
    });

    await expect(verifier.verify(token, baseNow)).rejects.toThrow('exceeds maximum allowed TTL');
  });

  // 16. missing sub rejected
  it('16. rejects assertion when sub claim is missing', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { sub: undefined } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 17. empty sub rejected
  it('17. rejects assertion when sub claim is empty string', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { sub: '' } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 18. missing orgId rejected
  it('18. rejects assertion when orgId claim is missing', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { orgId: undefined } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 19. invalid orgId rejected (non-uuid)
  it('19. rejects assertion when orgId claim is not a valid UUID', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { orgId: 'invalid-non-uuid' } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 20. missing jti rejected
  it('20. rejects assertion when jti claim is missing', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const token = await createTestAssertion({ claims: { jti: undefined } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  // 21. malformed token rejected
  it('21. rejects completely malformed token strings', async () => {
    const verifier = new ServiceAssertionVerifier({ publicJwks });

    await expect(verifier.verify('not.a.valid.jwt.token')).rejects.toThrow(AuthenticationError);
    await expect(verifier.verify('')).rejects.toThrow(AuthenticationError);
    await expect(verifier.verify(null as unknown as string)).rejects.toThrow(AuthenticationError);
  });

  // 22. JWKS containing private material rejected
  it('22. fails construction if JWKS contains private key material', () => {
    const dangerousJwks: JSONWebKeySet = {
      keys: [privateJwk], // privateJwk contains 'd' parameter
    };

    expect(() => new ServiceAssertionVerifier({ publicJwks: dangerousJwks })).toThrow(
      'Security Violation: API JWKS must not contain private key material',
    );
  });

  it('proves clock tolerance does NOT expand nominal TTL beyond 30 seconds', async () => {
    const verifier = new ServiceAssertionVerifier({
      publicJwks,
      clockToleranceSeconds: DEFAULT_CLOCK_TOLERANCE_SECONDS,
    });
    const baseNow = 1700000000;

    // A token with exp - iat = 35s is rejected even within tolerance window
    const invalidLongLivedToken = await createTestAssertion({
      claims: { iat: baseNow, exp: baseNow + 35 },
      skewNowSeconds: baseNow,
    });

    await expect(verifier.verify(invalidLongLivedToken, baseNow)).rejects.toThrow(
      `exceeds maximum allowed TTL (${MAX_ASSERTION_LIFETIME_SECONDS}s)`,
    );
  });
});
