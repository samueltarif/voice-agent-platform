/**
 * E2-V (2ª etapa) — webhook EXPERIMENTAL autenticado da ferramenta de agenda.
 *
 * - Escuta só em 127.0.0.1. A exposição HTTPS temporária (túnel) é passo
 *   separado, apenas com autorização (README).
 * - Uma rota: `POST /tool/e2v-agenda`, com `x-e2v-token` (comparação em tempo
 *   constante). Sem token válido: 401, sem executar o cenário. Outro método
 *   autenticado: 405 registrado (a Millis chamou via GET no 2º experimento);
 *   `acceptGet` (E2V_ACCEPT_GET=1) aceita GET com os parâmetros na query,
 *   como contingência de diagnóstico — o token continua obrigatório.
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

function queryOf(req) {
  return Object.fromEntries(new URL(req.url, 'http://127.0.0.1').searchParams);
}

function reply(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/** Autenticação e método; devolve o corpo já lido ou `null` (resposta enviada). */
async function admit(req, res, ctx, base) {
  if (base.path !== AGENDA_TOOL_PATH) {
    ctx.log.write('rejected', { ...base, status: 404 });
    return reply(res, 404, { status: 'NOT_FOUND' }) ?? null;
  }
  if (!sameToken(req.headers[TOKEN_HEADER], ctx.token)) {
    const auth_header_present = req.headers[TOKEN_HEADER] !== undefined;
    ctx.log.write('rejected', { ...base, status: 401, auth_header_present });
    return reply(res, 401, { status: 'UNAUTHORIZED' }) ?? null;
  }
  if (req.method === 'GET' && ctx.acceptGet) return { ok: true, value: queryOf(req) };
  if (req.method !== 'POST') {
    // 2º experimento real: a Millis chamou via GET. Registra (autenticado) e recusa.
    ctx.log.write('rejected', { ...base, status: 405, query: queryOf(req) });
    res.setHeader('allow', ctx.acceptGet ? 'POST, GET' : 'POST');
    return reply(res, 405, { status: 'METHOD_NOT_ALLOWED' }) ?? null;
  }
  try {
    return parseJson(await readBody(req));
  } catch (error) {
    ctx.log.write('rejected', { ...base, status: error.status ?? 400 });
    return reply(res, error.status ?? 400, { status: 'BAD_REQUEST' }) ?? null;
  }
}

async function handle(req, res, ctx) {
  const id = randomUUID();
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const base = { id, method: req.method, path, headers: safeHeaders(req.headers) };
  const parsed = await admit(req, res, ctx, base);
  if (!parsed) return;
  const scenario = ctx.scenario();
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

export function createWebhookServer({
  token,
  scenario,
  log,
  timeoutMs = 30_000,
  acceptGet = false,
}) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('token do webhook ausente ou curto');
  const ctx = { token, scenario, log, timeoutMs, acceptGet };
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
