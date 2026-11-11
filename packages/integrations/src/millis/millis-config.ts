/**
 * 008-OF5 (S3) — Configuração do adaptador Millis AI (sessão conversacional
 * registrada para SIP). DESATIVADO por padrão. A chave de API nunca aparece em
 * `toString`/JSON/logs.
 *
 * Referências oficiais (verificadas em 2026-11-11):
 * - OpenAPI: https://docs.millis.ai/api-reference/openapi.json
 *   (`servers`: https://api-west.millis.ai e https://api-eu-west.millis.ai;
 *   autenticação = cabeçalho `authorization`; não há `securitySchemes`)
 * - SIP: https://docs.millis.ai/integration/sip
 */
export const MILLIS_REGION_BASE_URLS = {
  'us-west': 'https://api-west.millis.ai',
  'eu-west': 'https://api-eu-west.millis.ai',
} as const;
export type MillisRegion = keyof typeof MILLIS_REGION_BASE_URLS;

export interface MillisConfig {
  /** Interruptor do adaptador; `false` recusa toda operação de rede. */
  readonly enabled: boolean;
  readonly region: MillisRegion;
  /** Tempo máximo de espera de cada requisição, em ms. */
  readonly requestTimeoutMs: number;
}

export class MillisConfigError extends Error {
  constructor(field: string) {
    super(`Configuração Millis inválida: ${field}.`);
    this.name = 'MillisConfigError';
  }
}

export class MillisDisabledError extends Error {
  constructor() {
    super('Adaptador Millis desativado (enabled=false).');
    this.name = 'MillisDisabledError';
  }
}

export function validateMillisConfig(config: MillisConfig): MillisConfig {
  if (typeof config.enabled !== 'boolean') throw new MillisConfigError('enabled');
  if (!Object.hasOwn(MILLIS_REGION_BASE_URLS, config.region)) {
    throw new MillisConfigError('region');
  }
  const timeout = config.requestTimeoutMs;
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
    throw new MillisConfigError('requestTimeoutMs');
  }
  return Object.freeze({ ...config });
}

/** Chave privada de API. O formato do valor do cabeçalho é PROVIDER_UNVERIFIED. */
export class MillisApiKey {
  readonly #value: string;

  constructor(value: string) {
    if (!/^[A-Za-z0-9._-]{16,256}$/.test(value)) throw new MillisConfigError('apiKey');
    this.#value = value;
  }

  authorizationHeaderValue(): string {
    return this.#value;
  }

  toString(): string {
    return '[REDACTED_MILLIS_API_KEY]';
  }

  toJSON(): string {
    return '[REDACTED_MILLIS_API_KEY]';
  }
}
