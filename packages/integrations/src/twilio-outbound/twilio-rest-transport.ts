import {
  TwilioOutboundDisabledError,
  type TwilioOutboundConfig,
  type TwilioRestCredentials,
} from './twilio-outbound-config.js';

/**
 * 008-OF5 (S2) — Transporte REST mínimo para a Calls API. É uma PORTA: os
 * testes usam o `FakeTwilioOriginationSimulator`; a implementação com `fetch`
 * só é criada por uma composição autorizada (nenhuma composição a usa hoje).
 */
export interface TwilioRestRequest {
  readonly method: 'GET' | 'POST';
  /** Caminho relativo à conta, ex.: `/Calls.json` ou `/Calls/CA…json`. */
  readonly path: string;
  /** Pares em ordem; chaves repetidas são permitidas (ex.: `StatusCallbackEvent`). */
  readonly form?: ReadonlyArray<readonly [string, string]>;
  readonly query?: ReadonlyArray<readonly [string, string]>;
}

export type TwilioRestResponse =
  | { readonly kind: 'HTTP'; readonly status: number; readonly body: unknown }
  /** Sem resposta (timeout, conexão caída): o efeito no provedor é DESCONHECIDO. */
  | { readonly kind: 'NO_RESPONSE'; readonly cause: 'TIMEOUT' | 'NETWORK' };

export interface TwilioRestTransport {
  send(request: TwilioRestRequest): Promise<TwilioRestResponse>;
}

const ACCOUNT_PATH_PATTERN = /^\/(Calls\.json|Calls\/CA[0-9a-f]{32}\.json)$/;

function encodePairs(pairs: ReadonlyArray<readonly [string, string]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of pairs) params.append(key, value);
  return params.toString();
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export interface FetchTwilioRestTransportOptions {
  readonly config: TwilioOutboundConfig;
  readonly credentials: TwilioRestCredentials;
  readonly fetchFn: typeof fetch;
}

/**
 * Implementação com `fetch` injetado. Recusa qualquer caminho fora da Calls API
 * e qualquer uso com o adaptador desativado. Não é usada por nenhum teste com
 * rede real nem por nenhuma composição de runtime.
 */
export function createFetchTwilioRestTransport(
  options: FetchTwilioRestTransportOptions,
): TwilioRestTransport {
  const { config, credentials, fetchFn } = options;
  const accountBase = `${config.apiBaseUrl}/2010-04-01/Accounts/${config.accountSid}`;
  return {
    async send(request) {
      if (!config.enabled) throw new TwilioOutboundDisabledError();
      if (!ACCOUNT_PATH_PATTERN.test(request.path)) throw new Error('Caminho Twilio recusado.');
      const query = request.query ? `?${encodePairs(request.query)}` : '';
      try {
        const response = await fetchFn(`${accountBase}${request.path}${query}`, {
          method: request.method,
          headers: {
            Authorization: credentials.basicAuthorizationHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          ...(request.form ? { body: encodePairs(request.form) } : {}),
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
