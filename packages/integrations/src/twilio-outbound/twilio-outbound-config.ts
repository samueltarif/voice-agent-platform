/**
 * 008-OF5 (S2) — Configuração do adaptador Twilio de originação outbound com
 * `<Dial><Sip>`. DESATIVADO por padrão: sem `enabled: true` nenhuma operação
 * de rede é tentada. Credenciais nunca aparecem em `toString`/JSON/logs.
 *
 * Referências oficiais (verificadas em 2026-11-11):
 * - Calls API: https://www.twilio.com/docs/voice/api/call-resource
 * - `<Sip>`:  https://www.twilio.com/docs/voice/twiml/sip
 * - `<Dial>`: https://www.twilio.com/docs/voice/twiml/dial
 */

/** Regiões de origem do SIP de saída listadas na documentação do `<Sip>`. */
export const TWILIO_SIP_REGIONS = ['us1', 'us2', 'ie1', 'de1', 'sg1', 'jp1', 'br1', 'au1'] as const;
export type TwilioSipRegion = (typeof TWILIO_SIP_REGIONS)[number];
/** Transportes aceitos pelo `<Sip>` (padrão da Twilio: UDP). */
export const TWILIO_SIP_TRANSPORTS = ['udp', 'tcp', 'tls'] as const;
export type TwilioSipTransport = (typeof TWILIO_SIP_TRANSPORTS)[number];

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const HTTPS_BASE_PATTERN =
  /^https:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-])?$/;

export interface TwilioOutboundConfig {
  /** Interruptor do adaptador; `false` recusa toda operação de rede. */
  readonly enabled: boolean;
  readonly accountSid: string;
  /** Base da API REST, só HTTPS e sem barra final. */
  readonly apiBaseUrl: string;
  /** Base HTTPS pública dos callbacks (staging com TLS), sem barra final. */
  readonly callbackBaseUrl: string;
  /** Números de origem Twilio autorizados para esta organização (E.164). */
  readonly authorizedCallerIds: readonly string[];
  readonly sipRegion: TwilioSipRegion;
  readonly sipTransport: TwilioSipTransport;
  /** Tempo de toque em segundos (documentado: padrão 60, máximo 600). */
  readonly ringTimeoutSeconds: number;
  /** Duração máxima da tentativa em segundos (corte na operadora e no `<Dial>`). */
  readonly maxCallDurationSeconds: number;
  /** Tempo máximo de espera de cada requisição REST, em ms. */
  readonly requestTimeoutMs: number;
}

export class TwilioOutboundConfigError extends Error {
  constructor(field: string) {
    super(`Configuração Twilio outbound inválida: ${field}.`);
    this.name = 'TwilioOutboundConfigError';
  }
}

export class TwilioOutboundDisabledError extends Error {
  constructor() {
    super('Adaptador Twilio outbound desativado (enabled=false).');
    this.name = 'TwilioOutboundDisabledError';
  }
}

function requireThat(condition: boolean, field: string): void {
  if (!condition) throw new TwilioOutboundConfigError(field);
}

function isIntIn(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Valida a configuração inteira; falha fechada em qualquer campo fora do esperado. */
export function validateTwilioOutboundConfig(config: TwilioOutboundConfig): TwilioOutboundConfig {
  requireThat(typeof config.enabled === 'boolean', 'enabled');
  requireThat(/^AC[0-9a-f]{32}$/.test(config.accountSid), 'accountSid');
  requireThat(HTTPS_BASE_PATTERN.test(config.apiBaseUrl), 'apiBaseUrl');
  requireThat(HTTPS_BASE_PATTERN.test(config.callbackBaseUrl), 'callbackBaseUrl');
  requireThat(config.authorizedCallerIds.length > 0, 'authorizedCallerIds');
  requireThat(
    config.authorizedCallerIds.every((id) => E164_PATTERN.test(id)),
    'authorizedCallerIds',
  );
  requireThat(TWILIO_SIP_REGIONS.includes(config.sipRegion), 'sipRegion');
  requireThat(TWILIO_SIP_TRANSPORTS.includes(config.sipTransport), 'sipTransport');
  requireThat(isIntIn(config.ringTimeoutSeconds, 5, 600), 'ringTimeoutSeconds');
  requireThat(isIntIn(config.maxCallDurationSeconds, 30, 14_400), 'maxCallDurationSeconds');
  requireThat(config.maxCallDurationSeconds > config.ringTimeoutSeconds, 'maxCallDurationSeconds');
  requireThat(isIntIn(config.requestTimeoutMs, 1_000, 30_000), 'requestTimeoutMs');
  return Object.freeze({ ...config, authorizedCallerIds: [...config.authorizedCallerIds] });
}

/** Credenciais REST (API Key SID + segredo, ou Account SID + Auth Token). */
export class TwilioRestCredentials {
  readonly #username: string;
  readonly #secret: string;

  constructor(username: string, secret: string) {
    if (!/^(AC|SK)[0-9a-f]{32}$/.test(username) || secret.trim().length < 16) {
      throw new TwilioOutboundConfigError('credentials');
    }
    this.#username = username;
    this.#secret = secret;
  }

  basicAuthorizationHeader(): string {
    return `Basic ${Buffer.from(`${this.#username}:${this.#secret}`).toString('base64')}`;
  }

  toString(): string {
    return '[REDACTED_TWILIO_CREDENTIALS]';
  }

  toJSON(): string {
    return '[REDACTED_TWILIO_CREDENTIALS]';
  }
}
