/**
 * E2-V (2ª etapa) — registro das requisições do webhook (JSON por linha).
 * Guarda horário de parede e monotônico, cenário, corpo, status e latência.
 * Cabeçalhos: só uma lista permitida; credenciais nunca são gravadas (nem
 * quando erradas) — registra-se apenas se o token estava presente e válido.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { redact } from '../src/event-log.mjs';

const KEPT_HEADERS = ['content-type', 'content-length', 'user-agent', 'x-forwarded-for', 'cf-ray'];

export function safeHeaders(headers) {
  return Object.fromEntries(
    KEPT_HEADERS.filter((name) => headers[name] !== undefined).map((name) => [name, headers[name]]),
  );
}

export function createRequestLog({
  file = null,
  clock = () => performance.now(),
  wall = () => new Date(),
} = {}) {
  const entries = [];
  const t0 = clock();
  if (file) mkdirSync(dirname(file), { recursive: true });
  return {
    entries,
    write(kind, data) {
      const entry = {
        wall: wall().toISOString(),
        t_ms: Math.round(clock() - t0),
        origin: 'WEBHOOK',
        kind,
        ...redact(data),
      };
      entries.push(entry);
      if (file) appendFileSync(file, `${JSON.stringify(entry)}\n`);
      return entry;
    },
  };
}
