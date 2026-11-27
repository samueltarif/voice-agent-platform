/**
 * E2-V — remoção de credenciais de TUDO o que é registrado ou exportado
 * (registro da página, JSONL do webhook, linha do tempo).
 * Três camadas:
 * 1. chaves com nome de credencial (token, secret, password, api key, public
 *    key, authorization, cookie, signature, credential) → `[REDACTED]`;
 * 2. objetos `header`/`headers` (ex.: cabeçalhos de ferramenta no
 *    `agent_config` enviado à Millis, ecoados em eventos) → todos os valores
 *    removidos, mantendo só os nomes;
 * 3. valores secretos conhecidos (chave pública digitada, token do webhook)
 *    → removidos de QUALQUER texto, inclusive mensagens de erro e query.
 */

const SECRET_KEY =
  /(token|secret|passw(or)?d|api[_-]?key|public[_-]?key|authori[sz]ation|cookie|signature|credential)/i;
const HEADER_KEY = /^headers?$/i;
export const REDACTED = '[REDACTED]';

function scrubString(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join(REDACTED);
  }
  return out;
}

export function redact(value, secrets = []) {
  if (typeof value === 'string') return scrubString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (SECRET_KEY.test(key)) return [key, REDACTED];
      if (HEADER_KEY.test(key) && v && typeof v === 'object' && !Array.isArray(v)) {
        return [key, Object.fromEntries(Object.keys(v).map((name) => [name, REDACTED]))];
      }
      return [key, redact(v, secrets)];
    }),
  );
}
