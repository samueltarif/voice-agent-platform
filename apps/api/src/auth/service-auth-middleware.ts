import type { Context, MiddlewareHandler } from 'hono';
import { AuthenticationError } from '@voice-agent/errors';
import type { ServiceAssertionClaims } from '@voice-agent/contracts';
import type { ServiceAssertionVerifier } from './service-assertion-verifier.js';

export function serviceAuthMiddleware(verifier: ServiceAssertionVerifier): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AuthenticationError('Empty service assertion token in Authorization header');
    }

    const claims = await verifier.verify(token);
    c.set('serviceAuth', claims);

    await next();
  };
}

export function getServiceAuth(c: Context): ServiceAssertionClaims {
  const claims = c.get('serviceAuth') as ServiceAssertionClaims | undefined;
  if (!claims) {
    throw new AuthenticationError('Service assertion context not found on request');
  }
  return claims;
}
