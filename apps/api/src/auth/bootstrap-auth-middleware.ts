import type { Context, MiddlewareHandler } from 'hono';
import { AuthenticationError } from '@voice-agent/errors';
import type { UserBootstrapAssertionClaims } from '@voice-agent/contracts';
import type { BootstrapAssertionVerifier } from './bootstrap-assertion-verifier.js';

export function bootstrapAuthMiddleware(verifier: BootstrapAssertionVerifier): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AuthenticationError('Empty bootstrap assertion token in Authorization header');
    }

    const claims = await verifier.verify(token);
    c.set('bootstrapAuth', claims);

    await next();
  };
}

export function getBootstrapAuth(c: Context): UserBootstrapAssertionClaims {
  const claims = c.get('bootstrapAuth') as UserBootstrapAssertionClaims | undefined;
  if (!claims) {
    throw new AuthenticationError('Bootstrap assertion context not found on request');
  }
  return claims;
}
