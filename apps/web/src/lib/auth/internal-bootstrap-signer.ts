import { randomUUID } from 'node:crypto';
import { importJWK, SignJWT, type JWK } from 'jose';
import {
  type UserBootstrapAssertionClaims,
  DEFAULT_BOOTSTRAP_AUDIENCE,
  DEFAULT_BOOTSTRAP_ISSUER,
  BOOTSTRAP_ASSERTION_SCOPE,
  BOOTSTRAP_ASSERTION_TTL_SECONDS,
} from '@voice-agent/contracts';

type ImportedKey = Awaited<ReturnType<typeof importJWK>>;

export interface CreateBootstrapAssertionInput {
  userId: string;
  privateJwk: JWK;
  kid: string;
  issuer?: string;
  audience?: string;
  nowSeconds?: number;
}

export const DEFAULT_BOOTSTRAP_SCOPE = BOOTSTRAP_ASSERTION_SCOPE;

export {
  BOOTSTRAP_ASSERTION_TTL_SECONDS,
  DEFAULT_BOOTSTRAP_ISSUER,
  DEFAULT_BOOTSTRAP_AUDIENCE,
  BOOTSTRAP_ASSERTION_SCOPE,
};

export class InternalBootstrapSigner {
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

  async signBootstrapAssertion(input: CreateBootstrapAssertionInput): Promise<string> {
    if (!input.userId) {
      throw new Error('Bootstrap assertion userId (sub) cannot be empty');
    }
    if (!input.kid) {
      throw new Error('Bootstrap assertion kid cannot be empty');
    }

    const privateKey = await this.getPrivateKey(input.privateJwk);
    const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const exp = iat + BOOTSTRAP_ASSERTION_TTL_SECONDS;
    const jti = randomUUID();
    const iss = input.issuer ?? DEFAULT_BOOTSTRAP_ISSUER;
    const aud = input.audience ?? DEFAULT_BOOTSTRAP_AUDIENCE;

    const claims: UserBootstrapAssertionClaims = {
      sub: input.userId,
      scope: DEFAULT_BOOTSTRAP_SCOPE,
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

export const internalBootstrapSigner = new InternalBootstrapSigner();
