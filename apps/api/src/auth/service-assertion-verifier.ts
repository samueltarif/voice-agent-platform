import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
} from 'jose';
import { AuthenticationError } from '@voice-agent/errors';
import {
  serviceAssertionClaimsSchema,
  type ServiceAssertionClaims,
} from '@voice-agent/contracts';

export interface VerifierConfig {
  publicJwks: JSONWebKeySet;
  expectedIssuer?: string;
  expectedAudience?: string;
  clockToleranceSeconds?: number;
}

export const MAX_ASSERTION_LIFETIME_SECONDS = 30 as const;
export const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5 as const;
export const DEFAULT_EXPECTED_ISSUER = 'voice-agent:web' as const;
export const DEFAULT_EXPECTED_AUDIENCE = 'voice-agent:api' as const;

export class ServiceAssertionVerifier {
  private readonly jwksResolver: ReturnType<typeof createLocalJWKSet>;
  private readonly expectedIssuer: string;
  private readonly expectedAudience: string;
  private readonly clockTolerance: number;
  private readonly knownKids = new Set<string>();

  constructor(config: VerifierConfig) {
    if (!config.publicJwks || !Array.isArray(config.publicJwks.keys)) {
      throw new Error('Verifier requires a valid JWKS object with a keys array');
    }

    // Invariant: Fail closed if JWKS contains any private key material (RFC 8037 / RFC 7517)
    for (const k of config.publicJwks.keys) {
      if ('d' in k) {
        throw new Error('Security Violation: API JWKS must not contain private key material');
      }
      if (k.kid) {
        this.knownKids.add(k.kid);
      }
    }

    this.expectedIssuer = config.expectedIssuer ?? DEFAULT_EXPECTED_ISSUER;
    this.expectedAudience = config.expectedAudience ?? DEFAULT_EXPECTED_AUDIENCE;
    this.clockTolerance = config.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;
    this.jwksResolver = createLocalJWKSet(config.publicJwks);
  }

  async verify(token: string, nowSeconds?: number): Promise<ServiceAssertionClaims> {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Missing or invalid service assertion token');
    }

    // 1. Validate Protected Header
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new AuthenticationError('Malformed token header');
    }

    if (header.typ !== 'JWT') {
      throw new AuthenticationError(`Invalid token typ '${header.typ}', expected 'JWT'`);
    }
    if (header.alg !== 'EdDSA') {
      throw new AuthenticationError(`Invalid algorithm '${header.alg}', expected 'EdDSA'`);
    }
    if (!header.kid) {
      throw new AuthenticationError('Token header is missing required kid parameter');
    }
    if (!this.knownKids.has(header.kid)) {
      throw new AuthenticationError(`Unknown key identifier '${header.kid}' in assertion`);
    }

    // 2. Cryptographic signature and claim verification via jose
    const currentUnix = nowSeconds ?? Math.floor(Date.now() / 1000);
    let payload: Record<string, unknown>;

    try {
      const result = await jwtVerify(token, this.jwksResolver, {
        algorithms: ['EdDSA'],
        issuer: this.expectedIssuer,
        audience: this.expectedAudience,
        clockTolerance: this.clockTolerance,
        currentDate: new Date(currentUnix * 1000),
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Signature verification failed';
      throw new AuthenticationError(`Service assertion verification failed: ${msg}`);
    }

    // 3. Explicit Lifetime and Skew Invariants (Section A)
    const iat = payload.iat as number | undefined;
    const exp = payload.exp as number | undefined;

    if (typeof iat !== 'number' || typeof exp !== 'number') {
      throw new AuthenticationError('Token missing iat or exp timestamp claims');
    }
    if (exp <= iat) {
      throw new AuthenticationError(`Token exp (${exp}) must be greater than iat (${iat})`);
    }
    if (exp - iat > MAX_ASSERTION_LIFETIME_SECONDS) {
      throw new AuthenticationError(
        `Token lifetime (${exp - iat}s) exceeds maximum allowed TTL (${MAX_ASSERTION_LIFETIME_SECONDS}s)`,
      );
    }
    if (iat > currentUnix + this.clockTolerance) {
      throw new AuthenticationError(`Token iat (${iat}) is too far in the future`);
    }
    if (currentUnix - this.clockTolerance >= exp) {
      throw new AuthenticationError(`Token has expired (exp: ${exp}, current: ${currentUnix})`);
    }

    // 4. Schema Validation of Claims Set
    const parseResult = serviceAssertionClaimsSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new AuthenticationError(
        `Invalid assertion claims: ${parseResult.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    return parseResult.data;
  }
}
