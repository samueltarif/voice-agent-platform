import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function sanitizeOrGenerateRequestId(incoming?: string | null): string {
  if (incoming && REQUEST_ID_REGEX.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

export function requestIdMiddleware(): MiddlewareHandler {
  return async (c: Context, next) => {
    const rawHeader = c.req.header('x-request-id');
    const requestId = sanitizeOrGenerateRequestId(rawHeader);

    c.set('requestId', requestId);
    await next();
    c.res.headers.set('x-request-id', requestId);
  };
}

export function getRequestId(c: Context): string {
  const reqId = c.get('requestId') as string | undefined;
  return reqId ?? randomUUID();
}
