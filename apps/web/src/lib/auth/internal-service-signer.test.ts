import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportJWK, decodeProtectedHeader, decodeJwt } from 'jose';
import { internalServiceSigner, ASSERTION_TTL_SECONDS } from './internal-service-signer.js';

describe('InternalServiceSigner', () => {
  it('creates an EdDSA signed assertion with strict header and claims', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'web-key-1';

    const userId = 'user-test-123';
    const organizationId = '11111111-1111-1111-1111-111111111111';

    const token = await internalServiceSigner.createAssertion({
      userId,
      organizationId,
      privateJwk,
      kid: 'web-key-1',
    });

    expect(typeof token).toBe('string');

    // Inspect header
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('web-key-1');
    expect(header.typ).toBe('JWT');

    // Inspect claims
    const payload = decodeJwt(token);
    expect(payload.sub).toBe(userId);
    expect(payload.orgId).toBe(organizationId);
    expect(payload.iss).toBe('voice-agent:web');
    expect(payload.aud).toBe('voice-agent:api');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.jti).toBe('string');

    // Strict duration invariant
    expect((payload.exp as number) - (payload.iat as number)).toBe(ASSERTION_TTL_SECONDS);
  });

  it('rejects creation when required parameters are missing', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);

    await expect(
      internalServiceSigner.createAssertion({
        userId: '',
        organizationId: '11111111-1111-1111-1111-111111111111',
        privateJwk,
        kid: 'k1',
      }),
    ).rejects.toThrow('Assertion userId (sub) cannot be empty');

    await expect(
      internalServiceSigner.createAssertion({
        userId: 'u1',
        organizationId: '',
        privateJwk,
        kid: 'k1',
      }),
    ).rejects.toThrow('Assertion organizationId (orgId) cannot be empty');
  });
});
