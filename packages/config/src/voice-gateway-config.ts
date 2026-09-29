import { InvalidCanonicalUrlError } from '@voice-agent/errors';

export interface VoiceGatewayConfig {
  readonly publicVoiceBaseUrl: string;
  readonly conversationRelayPath: string;
  readonly bootstrapTtlMs: number;
}

export interface VoiceGatewayConfigInput {
  readonly publicVoiceBaseUrl: string;
  readonly conversationRelayPath?: string | undefined;
  readonly bootstrapTtlMs?: number | undefined;
  readonly isProduction?: boolean | undefined;
}

export const PROPOSED_DEFAULT_BOOTSTRAP_TTL_MS = 60_000;
export const DEFAULT_CONVERSATION_RELAY_PATH = '/v1/twilio/conversation-relay';

function assertSafeUrlStructure(parsed: URL): void {
  if (parsed.username || parsed.password) {
    throw new InvalidCanonicalUrlError('Public base URL must not contain user credentials');
  }
  if (parsed.hash) {
    throw new InvalidCanonicalUrlError('Public base URL must not contain fragments');
  }
  const host = parsed.hostname;
  if (!host || /[\s\r\n]/.test(host)) {
    throw new InvalidCanonicalUrlError('Public base URL contains an invalid host');
  }
}

function assertSafeProtocol(parsed: URL, isProduction: boolean, urlStr: string): void {
  if (isProduction && parsed.protocol !== 'https:') {
    throw new InvalidCanonicalUrlError(`Public base URL must use HTTPS in production: '${urlStr}'`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new InvalidCanonicalUrlError(
      `Unsupported protocol in public base URL: '${parsed.protocol}'`,
    );
  }
}

export function validatePublicVoiceBaseUrl(urlStr: string, isProduction = false): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new InvalidCanonicalUrlError(`Malformed public base URL: '${urlStr}'`);
  }

  assertSafeUrlStructure(parsed);
  assertSafeProtocol(parsed, isProduction, urlStr);

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${cleanPath}`;
}

export function deriveWebSocketUrl(
  publicBaseUrl: string,
  path = DEFAULT_CONVERSATION_RELAY_PATH,
): string {
  const normalizedBase = validatePublicVoiceBaseUrl(publicBaseUrl);
  const parsed = new URL(normalizedBase);
  const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${wsProtocol}//${parsed.host}${cleanPath}`;
}

export function createVoiceGatewayConfig(input: VoiceGatewayConfigInput): VoiceGatewayConfig {
  const normalizedBase = validatePublicVoiceBaseUrl(
    input.publicVoiceBaseUrl,
    input.isProduction ?? false,
  );
  const ttl = input.bootstrapTtlMs ?? PROPOSED_DEFAULT_BOOTSTRAP_TTL_MS;
  if (ttl <= 0 || !Number.isFinite(ttl)) {
    throw new Error('bootstrapTtlMs must be a positive number');
  }
  const rawPath = input.conversationRelayPath ?? DEFAULT_CONVERSATION_RELAY_PATH;
  const conversationRelayPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  return {
    publicVoiceBaseUrl: normalizedBase,
    conversationRelayPath,
    bootstrapTtlMs: ttl,
  };
}
