import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK, type JSONWebKeySet } from 'jose';
import { BootstrapAssertionVerifier } from './bootstrap-assertion-verifier.js';
import { AuthenticationError } from '@voice-agent/errors';

describe('BootstrapAssertionVerifier', () => {
  let privateJwk: JWK;
  let publicJwk: JWK;
  let publicJwks: JSONWebKeySet;
  const kid = 'test-boot-kid-1';
  const sub = 'usr_bootstrap_test_123';

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;
    publicJwks = { keys: [publicJwk] };
  });

  async function createTestBootstrapToken(
    overrides: {
      header?: Record<string, unknown>;
      claims?: Record<string, unknown>;
      signingKey?: JWK;
      ttlSeconds?: number;
      skewNowSeconds?: number;
    } = {},
  ): Promise<string> {
    const now = overrides.skewNowSeconds ?? Math.floor(Date.now() / 1000);
    const ttl = overrides.ttlSeconds ?? 30;
    const { importJWK } = await import('jose');
    const importedKey = await importJWK(overrides.signingKey ?? privateJwk, 'EdDSA');

    const defaultClaims = {
      sub,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: now,
      exp: now + ttl,
      jti: '11111111-1111-4111-8111-111111111111',
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

  it('1. accepts a valid EdDSA signed bootstrap assertion', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken();
    const verified = await verifier.verify(token);

    expect(verified.sub).toBe(sub);
    expect(verified.scope).toBe('user:bootstrap');
    expect(verified.iss).toBe('voice-agent:web');
    expect(verified.aud).toBe('voice-agent:api:bootstrap');
    expect(typeof verified.iat).toBe('number');
    expect(typeof verified.exp).toBe('number');
    expect(verified.exp - verified.iat).toBe(30);
  });

  it('2. rejects assertion when signature is tampered', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken();
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacked' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    await expect(verifier.verify(tamperedToken)).rejects.toThrow(AuthenticationError);
  });

  it('3. rejects assertion signed with unknown private key', async () => {
    const otherKeyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const otherPrivateJwk = await exportJWK(otherKeyPair.privateKey);
    otherPrivateJwk.kid = kid;

    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({ signingKey: otherPrivateJwk });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('4. rejects assertion with unknown kid', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({ header: { kid: 'unknown-kid' } });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('5. rejects assertion with missing kid', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const { importJWK } = await import('jose');
    const importedKey = await importJWK(privateJwk, 'EdDSA');
    const token = await new SignJWT({
      sub,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: '11111111-1111-4111-8111-111111111111',
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .sign(importedKey);

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('6. rejects expired assertion', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const pastTime = Math.floor(Date.now() / 1000) - 100;
    const token = await createTestBootstrapToken({
      skewNowSeconds: pastTime,
      ttlSeconds: 30,
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('7. rejects assertion with lifetime > 30 seconds', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({ ttlSeconds: 31 });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('8. rejects assertion with wrong audience (e.g. tenant audience)', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { aud: 'voice-agent:api' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('9. rejects assertion with wrong issuer', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { iss: 'rogue-issuer' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('10. rejects assertion with wrong scope', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { scope: 'user:full_access' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('11. rejects assertion containing forbidden orgId claim', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { orgId: '11111111-1111-1111-1111-111111111111' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('12. rejects assertion containing forbidden role claim', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { role: 'admin' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('13. rejects assertion containing forbidden roles or permissions claims', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { permissions: ['agent:read', 'agent:write'] },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('14. rejects assertion containing forbidden plan, membership or profile claims', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const token = await createTestBootstrapToken({
      claims: { plan: 'enterprise', membership: 'active', email: 'test@example.com' },
    });

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('15. rejects assertion with unsupported algorithm (e.g. HS256)', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const secret = new TextEncoder().encode('super-secret-key-that-is-long-enough-32b');
    const token = await new SignJWT({
      sub,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: '11111111-1111-4111-8111-111111111111',
    })
      .setProtectedHeader({ alg: 'HS256', kid, typ: 'JWT' })
      .sign(secret);

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('16. rejects assertion with invalid or missing typ header', async () => {
    const verifier = new BootstrapAssertionVerifier({ publicJwks });
    const { importJWK } = await import('jose');
    const importedKey = await importJWK(privateJwk, 'EdDSA');
    const token = await new SignJWT({
      sub,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: '11111111-1111-4111-8111-111111111111',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JOSE' as unknown as string })
      .sign(importedKey);

    await expect(verifier.verify(token)).rejects.toThrow(AuthenticationError);
  });

  it('17. fail-closed when public JWKS contains private key material (d parameter)', () => {
    expect(() => {
      new BootstrapAssertionVerifier({
        publicJwks: { keys: [privateJwk] },
      });
    }).toThrow('Security Violation: API JWKS must not contain private key material');
  });
});
