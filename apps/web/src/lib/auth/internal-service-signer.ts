import { randomUUID } from 'node:crypto';
import { importJWK, SignJWT, type JWK } from 'jose';
import type { ServiceAssertionClaims } from '@voice-agent/contracts';

type ImportedKey = Awaited<ReturnType<typeof importJWK>>;

export interface CreateAssertionInput {
  userId: string;
  organizationId: string;
  privateJwk: JWK;
  kid: string;
  issuer?: string;
  audience?: string;
  nowSeconds?: number;
}

export const ASSERTION_TTL_SECONDS = 30 as const;
export const DEFAULT_SERVICE_ISSUER = 'voice-agent:web' as const;
export const DEFAULT_SERVICE_AUDIENCE = 'voice-agent:api' as const;

export class InternalServiceSigner {
  private keyCache = new Map<string, ImportedKey>();

  private async getPrivateKey(jwk: JWK): Promise<ImportedKey> {
    const keyId = jwk.kid ?? 'default';
    const cached = this.keyCache.get(keyId);
    if (cached) {
      return cached;
    }
    const imported = await importJWK(jwk, 'EdDSA');
    this.keyCache.set(keyId, imported);
    return imported;
  }

  async createAssertion(input: CreateAssertionInput): Promise<string> {
    if (!input.userId) {
      throw new Error('Assertion userId (sub) cannot be empty');
    }
    if (!input.organizationId) {
      throw new Error('Assertion organizationId (orgId) cannot be empty');
    }
    if (!input.kid) {
      throw new Error('Assertion kid cannot be empty');
    }

    const privateKey = await this.getPrivateKey(input.privateJwk);
    const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const exp = iat + ASSERTION_TTL_SECONDS;
    const jti = randomUUID();
    const iss = input.issuer ?? DEFAULT_SERVICE_ISSUER;
    const aud = input.audience ?? DEFAULT_SERVICE_AUDIENCE;

    const claims: ServiceAssertionClaims = {
      sub: input.userId,
      orgId: input.organizationId,
      iss,
      aud,
      iat,
      exp,
      jti,
    };

    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid: input.kid, typ: 'JWT' })
      .sign(privateKey);
  }
}

export const internalServiceSigner = new InternalServiceSigner();
