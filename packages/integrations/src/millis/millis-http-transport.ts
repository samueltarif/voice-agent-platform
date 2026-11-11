import {
  MILLIS_REGION_BASE_URLS,
  MillisDisabledError,
  type MillisApiKey,
  type MillisConfig,
} from './millis-config.js';

/**
 * 008-OF5 (S3) — Porta de transporte HTTP para a API Millis. Os testes usam o
 * `FakeMillisConversationSimulator`; a implementação com `fetch` só é criada
 * por uma composição autorizada (nenhuma a usa hoje). Somente as três
 * operações documentadas usadas pela plataforma são aceitas.
 */
export interface MillisHttpRequest {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
}

export type MillisHttpResponse =
  | { readonly kind: 'HTTP'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'NO_RESPONSE'; readonly cause: 'TIMEOUT' | 'NETWORK' };

export interface MillisHttpTransport {
  send(request: MillisHttpRequest): Promise<MillisHttpResponse>;
}

/** Identificador opaco aceitável num segmento de caminho (sem `/`, `.`, `%`). */
export const MILLIS_PATH_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const ALLOWED_PATHS = [
  /^\/register_sip_call$/,
  /^\/sessions\/[A-Za-z0-9_-]{1,128}\/terminate$/,
  /^\/call-logs\/[A-Za-z0-9_-]{1,128}$/,
];

export function isAllowedMillisPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export interface FetchMillisTransportOptions {
  readonly config: MillisConfig;
  readonly apiKey: MillisApiKey;
  readonly fetchFn: typeof fetch;
}

export function createFetchMillisTransport(
  options: FetchMillisTransportOptions,
): MillisHttpTransport {
  const { config, apiKey, fetchFn } = options;
  const baseUrl = MILLIS_REGION_BASE_URLS[config.region];
  return {
    async send(request) {
      if (!config.enabled) throw new MillisDisabledError();
      if (!isAllowedMillisPath(request.path)) throw new Error('Caminho Millis recusado.');
      try {
        const response = await fetchFn(`${baseUrl}${request.path}`, {
          method: request.method,
          headers: {
            authorization: apiKey.authorizationHeaderValue(),
            'Content-Type': 'application/json',
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        });
        return { kind: 'HTTP', status: response.status, body: await readJson(response) };
      } catch (error) {
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        return { kind: 'NO_RESPONSE', cause: timeout ? 'TIMEOUT' : 'NETWORK' };
      }
    },
  };
}
