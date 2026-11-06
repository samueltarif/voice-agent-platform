import { UnsafeInternalApiPathError } from './internal-api-path.js';

/**
 * F1 (DEC-051) — última barreira antes do `fetch` dos clientes internos:
 * o caminho não pode trocar origem, host ou endpoint por normalização.
 * Não recusa `%` de forma global: sequências `%XX` válidas são aceitas, desde
 * que o segmento decodificado não vire `.`/`..` nem contenha `/`, `\` ou `%`.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_ANYWHERE = /[\\#\s\u0000-\u001f\u007f]/;
const MALFORMED_PERCENT = /%(?![0-9A-Fa-f]{2})/;

function isUnsafeSegment(segment: string): boolean {
  if (segment.length === 0 || MALFORMED_PERCENT.test(segment)) return true;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return true;
  }
  return decoded === '.' || decoded === '..' || /[/\\%]/.test(decoded);
}

export function assertSafeInternalApiPath(path: string): void {
  const queryIndex = path.indexOf('?');
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  if (!pathname.startsWith('/') || FORBIDDEN_ANYWHERE.test(path)) {
    throw new UnsafeInternalApiPathError();
  }
  if (pathname.slice(1).split('/').some(isUnsafeSegment)) throw new UnsafeInternalApiPathError();
}

/** Monta a URL e confirma que nada foi normalizado nem saiu da origem da API. */
export function buildInternalApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  assertSafeInternalApiPath(normalizedPath);
  const raw = `${baseUrl}${normalizedPath}`;
  const base = new URL(baseUrl);
  const url = new URL(raw);
  const queryIndex = normalizedPath.indexOf('?');
  const expectedPathname =
    base.pathname.replace(/\/$/, '') +
    (queryIndex === -1 ? normalizedPath : normalizedPath.slice(0, queryIndex));
  if (url.origin !== base.origin || url.pathname !== expectedPathname) {
    throw new UnsafeInternalApiPathError();
  }
  return raw;
}
