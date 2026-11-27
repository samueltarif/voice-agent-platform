/**
 * E2-V (2ª etapa) — webhook EXPERIMENTAL autenticado da ferramenta de agenda.
 *
 * - Escuta só em 127.0.0.1. A exposição HTTPS temporária (túnel) é passo
 *   separado, apenas com autorização (README).
 * - Uma rota: `POST /tool/e2v-agenda`, com `x-e2v-token` (comparação em tempo
 *   constante). Sem token válido: 401, sem executar o cenário.
 * - Não importa nada da VAP, não acessa banco e não tem efeito: devolve o
 *   cenário escolhido (sucesso, indisponibilidade, erro ou timeout).
 * - Controle do cenário em OUTRA porta, também só 127.0.0.1 (nunca exposta).
 */
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AGENDA_TOOL_PATH, TOKEN_HEADER } from '../src/agenda-tool.mjs';
import { safeHeaders } from './request-log.mjs';
import { SCENARIOS, scenarioResponse } from './scenarios.mjs';

export const BODY_LIMIT = 16 * 1024;

export function newWebhookToken() {
  return randomBytes(24).toString('base64url');
}

const digest = (value) =>
  createHash('sha256')
    .update(String(value ?? ''))
    .digest();
const sameToken = (given, expected) => timingSafeEqual(digest(given), digest(expected));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('corpo grande demais'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text) {
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, value: { unparsed_length: text.length } };
  }
}

function reply(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function handle(req, res, ctx) {
  const id = randomUUID();
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const base = { id, method: req.method, path, headers: safeHeaders(req.headers) };
  if (req.method !== 'POST' || path !== AGENDA_TOOL_PATH) {
    ctx.log.write('rejected', { ...base, status: 404 });
    return reply(res, 404, { status: 'NOT_FOUND' });
  }
  if (!sameToken(req.headers[TOKEN_HEADER], ctx.token)) {
    ctx.log.write('rejected', {
      ...base,
      status: 401,
      token_present: req.headers[TOKEN_HEADER] !== undefined,
    });
    return reply(res, 401, { status: 'UNAUTHORIZED' });
  }
  let text;
  try {
    text = await readBody(req);
  } catch (error) {
    ctx.log.write('rejected', { ...base, status: error.status ?? 400 });
    return reply(res, error.status ?? 400, { status: 'BAD_REQUEST' });
  }
  const scenario = ctx.scenario();
  const parsed = parseJson(text);
  ctx.log.write('request', { ...base, scenario, body_json: parsed.ok, body: parsed.value });
  const started = performance.now();
  const response = scenarioResponse(scenario, { timeoutMs: ctx.timeoutMs });
  res.on('close', () => {
    if (!res.writableFinished)
      ctx.log.write('aborted', { id, scenario, after_ms: Math.round(performance.now() - started) });
  });
  if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
  reply(res, response.status, response.body);
  ctx.log.write('response', {
    id,
    scenario,
    status: response.status,
    body: response.body,
    latency_ms: Math.round(performance.now() - started),
  });
}

export function createWebhookServer({ token, scenario, log, timeoutMs = 30_000 }) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('token do webhook ausente ou curto');
  const ctx = { token, scenario, log, timeoutMs };
  return createServer((req, res) => {
    handle(req, res, ctx).catch(() => reply(res, 500, { status: 'INTERNAL' }));
  });
}

/** Controle local do cenário: GET /scenario e POST /scenario?set=<nome>. */
export function createControlServer({ state, log }) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/scenario') return reply(res, 404, { status: 'NOT_FOUND' });
    if (req.method === 'POST') {
      const next = url.searchParams.get('set');
      if (!SCENARIOS.includes(next))
        return reply(res, 400, { status: 'INVALID', scenarios: SCENARIOS });
      state.scenario = next;
      log.write('scenario', { scenario: next });
    }
    return reply(res, 200, { scenario: state.scenario, scenarios: SCENARIOS });
  });
}
