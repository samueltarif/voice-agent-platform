import type { NextRequest } from 'next/server';

export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const fetchSite = req.headers.get('sec-fetch-site');
    return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site';
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}
