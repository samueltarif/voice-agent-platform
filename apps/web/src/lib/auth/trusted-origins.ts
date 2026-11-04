/**
 * Origens aceitas pelo Better Auth além da origem de `BETTER_AUTH_URL`.
 *
 * - Sempre: a lista explícita `TRUSTED_ORIGINS` (vírgulas), só com origens
 *   http(s) válidas.
 * - Fora de produção: a própria origem da requisição quando ela é loopback
 *   (`localhost`, `127.0.0.1`, `[::1]`) em qualquer porta — o Next.js troca de
 *   porta quando a 3000 está ocupada, e o login não pode depender disso.
 *
 * Em produção, nenhuma origem é inferida: só `BETTER_AUTH_URL` e a lista
 * explícita valem (comportamento fail-closed do Better Auth preservado).
 */

export interface TrustedOriginsInput {
  readonly requestOrigin: string | null;
  readonly nodeEnv: string | undefined;
  readonly explicitList: string | undefined;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function toHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseExplicitList(list: string | undefined): string[] {
  if (!list) return [];
  return list
    .split(',')
    .map((item) => toHttpOrigin(item))
    .filter((origin): origin is string => origin !== null);
}

export function isLoopbackOrigin(origin: string): boolean {
  const normalized = toHttpOrigin(origin);
  if (!normalized) return false;
  return LOOPBACK_HOSTNAMES.has(new URL(normalized).hostname);
}

export function resolveTrustedOrigins(input: TrustedOriginsInput): string[] {
  const origins = parseExplicitList(input.explicitList);
  const isProduction = input.nodeEnv === 'production';
  if (!isProduction && input.requestOrigin && isLoopbackOrigin(input.requestOrigin)) {
    const origin = toHttpOrigin(input.requestOrigin);
    if (origin) origins.push(origin);
  }
  return Array.from(new Set(origins));
}
