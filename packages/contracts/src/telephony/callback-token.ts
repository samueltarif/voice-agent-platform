import { z } from 'zod';

/**
 * 008-OF5a (S1) — Token de callback por tentativa (D-CB-TOKEN = a, DEC-045).
 *
 * - 32 bytes de um gerador criptograficamente seguro (256 bits ≥ 128 exigidos),
 *   codificados em base64url sem padding (43 caracteres).
 * - Só o HASH (SHA-256, hex) é persistido; o valor vai apenas no URL assinado.
 * - O valor nunca aparece em logs: `toString`/`toJSON`/inspeção devolvem um marcador.
 *
 * A fonte de aleatoriedade e o hash são injetados (portas), pois este pacote é
 * neutro e não depende de APIs de runtime; a ligação real (CSPRNG do runtime)
 * é feita na orquestração (S4) e deve respeitar este contrato.
 */
export const CALLBACK_TOKEN_BYTES = 32;
export const CALLBACK_TOKEN_REDACTED = '[REDACTED_CALLBACK_TOKEN]';
export const callbackTokenStringSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const callbackTokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export interface CallbackTokenEntropySource {
  randomBytes(length: number): Uint8Array;
}

export interface CallbackTokenHasher {
  sha256Hex(value: string): Promise<string>;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let c = 0; c < chars; c += 1) out += BASE64URL[(chunk >> (18 - 6 * c)) & 63];
  }
  return out;
}

const tokenValues = new WeakMap<CallbackToken, string>();

/** Valor opaco: só `reveal()` expõe o texto (para montar o URL assinado). */
export class CallbackToken {
  private constructor(value: string) {
    tokenValues.set(this, value);
  }

  static fromString(raw: string): CallbackToken {
    return new CallbackToken(callbackTokenStringSchema.parse(raw));
  }

  reveal(): string {
    return tokenValues.get(this)!;
  }

  toString(): string {
    return CALLBACK_TOKEN_REDACTED;
  }

  toJSON(): string {
    return CALLBACK_TOKEN_REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return CALLBACK_TOKEN_REDACTED;
  }
}

export function generateCallbackToken(source: CallbackTokenEntropySource): CallbackToken {
  const bytes = source.randomBytes(CALLBACK_TOKEN_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.length !== CALLBACK_TOKEN_BYTES) {
    throw new Error('Fonte de aleatoriedade inválida para o token de callback');
  }
  return CallbackToken.fromString(encodeBase64Url(bytes));
}

export async function hashCallbackToken(
  token: CallbackToken,
  hasher: CallbackTokenHasher,
): Promise<string> {
  return callbackTokenHashSchema.parse(await hasher.sha256Hex(token.reveal()));
}

/** Comparação em tempo constante de dois hashes hex de mesmo tamanho. */
export function callbackTokenHashesMatch(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}
