import type { NextRequest } from 'next/server';

function extractHost(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).host.toLowerCase();
  } catch {
    return null;
  }
}

function addExplicitHosts(hosts: Set<string>, trustedStr?: string): void {
  if (!trustedStr) return;
  for (const raw of trustedStr.split(',')) {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed) hosts.add(trimmed);
  }
}

export function getTrustedHosts(): Set<string> {
  const hosts = new Set<string>();
  const candidates = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ];

  for (const urlStr of candidates) {
    const host = extractHost(urlStr);
    if (host) hosts.add(host);
  }

  addExplicitHosts(hosts, process.env.TRUSTED_HOSTS);

  if (process.env.NODE_ENV !== 'production') {
    hosts.add('localhost');
    hosts.add('localhost:3000');
    hosts.add('127.0.0.1');
    hosts.add('127.0.0.1:3000');
  }

  return hosts;
}

function parseOriginHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function matchesForwardedHost(originHost: string, forwardedRaw: string): boolean {
  const clientHost = forwardedRaw.split(',')[0]?.trim().toLowerCase();
  if (!clientHost) return false;
  return getTrustedHosts().has(clientHost) && originHost === clientHost;
}

function isAllowedMissingOrigin(fetchSite: string | null): boolean {
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site';
}

export function isSameOriginRequest(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') {
    return false;
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    return isAllowedMissingOrigin(req.headers.get('sec-fetch-site'));
  }

  const originHost = parseOriginHost(origin);
  if (!originHost) {
    return false;
  }

  const forwardedHostRaw = req.headers.get('x-forwarded-host');
  if (forwardedHostRaw) {
    return matchesForwardedHost(originHost, forwardedHostRaw);
  }

  const host = req.headers.get('host')?.toLowerCase();
  return Boolean(host && originHost === host);
}
