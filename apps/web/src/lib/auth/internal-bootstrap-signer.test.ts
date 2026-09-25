import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportJWK, decodeProtectedHeader, decodeJwt } from 'jose';
import {
  internalBootstrapSigner,
  BOOTSTRAP_ASSERTION_TTL_SECONDS,
  DEFAULT_BOOTSTRAP_AUDIENCE,
  DEFAULT_BOOTSTRAP_ISSUER,
  DEFAULT_BOOTSTRAP_SCOPE,
} from './internal-bootstrap-signer.js';

describe('InternalBootstrapSigner', () => {
  it('creates an EdDSA signed bootstrap assertion with strict header and claims', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'web-boot-key-1';

    const userId = 'user-bootstrap-123';

    const token = await internalBootstrapSigner.signBootstrapAssertion({
      userId,
      privateJwk,
      kid: 'web-boot-key-1',
    });

    expect(typeof token).toBe('string');

    // Inspect header
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('web-boot-key-1');
    expect(header.typ).toBe('JWT');

    // Inspect claims
    const payload = decodeJwt(token);
    expect(payload.sub).toBe(userId);
    expect(payload.scope).toBe(DEFAULT_BOOTSTRAP_SCOPE);
    expect(payload.iss).toBe(DEFAULT_BOOTSTRAP_ISSUER);
    expect(payload.aud).toBe(DEFAULT_BOOTSTRAP_AUDIENCE);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.jti).toBe('string');

    // Strict duration invariant
    expect((payload.exp as number) - (payload.iat as number)).toBe(BOOTSTRAP_ASSERTION_TTL_SECONDS);

    // Negative assertions: forbidden claims must NOT be present
    expect(payload.orgId).toBeUndefined();
    expect(payload.role).toBeUndefined();
    expect(payload.roles).toBeUndefined();
    expect(payload.permissions).toBeUndefined();
    expect(payload.entitlements).toBeUndefined();
    expect(payload.plan).toBeUndefined();
    expect(payload.membership).toBeUndefined();
  });

  it('rejects creation when required parameters are missing', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);

    await expect(
      internalBootstrapSigner.signBootstrapAssertion({
        userId: '',
        privateJwk,
        kid: 'k1',
      }),
    ).rejects.toThrow('Bootstrap assertion userId (sub) cannot be empty');

    await expect(
      internalBootstrapSigner.signBootstrapAssertion({
        userId: 'u1',
        privateJwk,
        kid: '',
      }),
    ).rejects.toThrow('Bootstrap assertion kid cannot be empty');
  });
});
