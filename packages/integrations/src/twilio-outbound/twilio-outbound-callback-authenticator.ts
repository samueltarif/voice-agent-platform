import type {
  ProviderWebhookAuthenticator,
  ProviderWebhookRequest,
  WebhookAuthOutcome,
} from '@voice-agent/contracts';
import { validateTwilioSignature } from '../twilio/twilio-signature-validator.js';

/**
 * 008-OF5 (S2) — Autenticação dos callbacks da chamada outbound por
 * `X-Twilio-Signature` (HMAC-SHA1 com o Auth Token sobre o URL completo +
 * parâmetros POST ordenados; algoritmo documentado em
 * https://www.twilio.com/docs/usage/security). Como o token `t` da tentativa
 * está na query assinada, trocá-lo invalida a assinatura.
 *
 * Fail-closed: sem Auth Token, sem URL, sem assinatura, corpo que não seja
 * formulário ou parâmetro repetido ⇒ REJECTED. A Twilio não assina um
 * horário: a proteção contra repetição é a deduplicação idempotente.
 */
export class TwilioAuthToken {
  readonly #value: string;

  constructor(value: string) {
    if (!/^[0-9a-f]{32}$/.test(value)) throw new Error('Auth Token Twilio inválido (formato).');
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return '[REDACTED_TWILIO_AUTH_TOKEN]';
  }

  toJSON(): string {
    return '[REDACTED_TWILIO_AUTH_TOKEN]';
  }
}

/** Corpo `application/x-www-form-urlencoded` → parâmetros; `null` se houver chave repetida. */
export function parseTwilioFormBody(rawBody: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    if (Object.hasOwn(params, key)) return null;
    params[key] = value;
  }
  return params;
}

/** Token opaco `t` do URL assinado; `null` se ausente, repetido ou fora do formato. */
export function readCallbackTokenFromUrl(url: string): string | null {
  let query: URLSearchParams;
  try {
    query = new URL(url).searchParams;
  } catch {
    return null;
  }
  const values = query.getAll('t');
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]!) ? values[0]! : null;
}

function isFormRequest(request: ProviderWebhookRequest): boolean {
  return (request.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded');
}

export function createTwilioOutboundCallbackAuthenticator(
  authToken: TwilioAuthToken | null,
): ProviderWebhookAuthenticator {
  return {
    async authenticate(request): Promise<WebhookAuthOutcome> {
      if (!authToken) return { kind: 'REJECTED', reason: 'NOT_CONFIGURED' };
      const signature = request.headers['x-twilio-signature'];
      if (!signature || !request.url) return { kind: 'REJECTED', reason: 'MISSING_CREDENTIALS' };
      const params = isFormRequest(request) ? parseTwilioFormBody(request.rawBody) : null;
      if (!params || !readCallbackTokenFromUrl(request.url)) {
        return { kind: 'REJECTED', reason: 'INVALID_CREDENTIALS' };
      }
      const valid = validateTwilioSignature({
        url: request.url,
        params,
        signature,
        authToken: authToken.reveal(),
      });
      return valid
        ? { kind: 'AUTHENTICATED' }
        : { kind: 'REJECTED', reason: 'INVALID_CREDENTIALS' };
    },
  };
}
