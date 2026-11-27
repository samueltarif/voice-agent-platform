/**
 * E2-V (3ª rodada) — correlaciona os eventos nativos `onfunction` (nome,
 * parâmetros e resultado, observados no 3º experimento real) com as
 * requisições/respostas do webhook e classifica o fim da sessão.
 *
 * Sem garantias: o fornecedor não documenta entrega, ordem nem identidade de
 * turno do `onfunction`. A ligação é por EVIDÊNCIA, com o critério explícito:
 * `PARAMS_AND_RESULT` > `PARAMS` > `RESULT` > `TIME_ONLY`; ambiguidades ficam
 * marcadas. A forma exata do `onfunction` também é tratada com tolerância
 * (`name`/`function_name`, `params`/`arguments`, `result`/`response`).
 *
 * Uso: node tools/correlate.mjs <e2v-sessao.json> <webhook.jsonl> [saida.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseJsonl } from './merge-timeline.mjs';

const WINDOW_MS = 60_000;
const META_KEYS = new Set(['session_id', 'metadata', 'call_id', 'agent_id']);

function first(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function maybeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function readOnFunction(entry) {
  const sources = [entry.data?.data, entry.data?.payload, entry.data];
  return {
    seq: entry.seq,
    wall: entry.wall,
    name: first(sources, ['name', 'function_name', 'function']) ?? null,
    params: maybeJson(first(sources, ['params', 'arguments', 'args'])) ?? null,
    result: maybeJson(first(sources, ['result', 'response', 'output'])) ?? null,
  };
}

const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

function businessParams(body) {
  if (!body || typeof body !== 'object') return {};
  return Object.fromEntries(Object.entries(body).filter(([key]) => !META_KEYS.has(key)));
}

function paramsMatch(fn, request) {
  const params = fn.params && typeof fn.params === 'object' ? fn.params : {};
  const body = businessParams(request.body);
  const keys = Object.keys(params);
  return keys.length > 0 && keys.every((key) => String(body[key]) === String(params[key]));
}

function resultMatch(fn, response) {
  return Boolean(response) && fn.result !== null && stable(fn.result) === stable(response.body);
}

function score(fn, pair) {
  const p = paramsMatch(fn, pair.request);
  const r = resultMatch(fn, pair.response);
  if (p && r) return [3, 'PARAMS_AND_RESULT'];
  if (p) return [2, 'PARAMS'];
  if (r) return [1, 'RESULT'];
  return [0, 'TIME_ONLY'];
}

function webhookPairs(entries) {
  const responses = new Map(entries.filter((e) => e.kind === 'response').map((e) => [e.id, e]));
  return entries
    .filter((e) => e.kind === 'request')
    .map((request) => ({ request, response: responses.get(request.id) ?? null }));
}

function bestPair(fn, pairs, used) {
  const at = Date.parse(fn.wall);
  let best = null;
  for (const pair of pairs) {
    if (used.has(pair.request.id)) continue;
    const delta = at - Date.parse(pair.request.wall);
    if (delta < -2_000 || delta > WINDOW_MS) continue;
    const [points, match] = score(fn, pair);
    const candidate = { pair, points, match, delta };
    if (!best || points > best.points || (points === best.points && delta < best.delta)) {
      best = { ...candidate, ambiguous: best?.points === points };
    }
  }
  return best;
}

const TOLERANCE_MS = 2_000;

function sessionLimits(entries) {
  const start = entries.find((e) => e.origin === 'LOCAL' && e.type === 'start');
  const agent = start?.data?.agent ?? {};
  return {
    startWall: start?.wall ?? null,
    maxIdle: agent.max_idle ?? null,
    maxDuration: agent.max_duration ?? null,
    prompt: agent.inactivity?.message ?? null,
  };
}

function lastUserActivity(entries, before) {
  const user = entries.filter((e) => e.type === 'ontranscript' && e.wall <= before);
  return user.at(-1)?.wall ?? null;
}

function promptSeen(entries, prompt, after) {
  if (!prompt) return false;
  return entries.some(
    (e) =>
      e.type === 'onresponsetext' && e.wall >= after && JSON.stringify(e.data).includes(prompt),
  );
}

/**
 * Fim da sessão (4ª rodada): `timeout` do fornecedor NÃO é automaticamente
 * inatividade. Classifica por evidência: duração ≥ `max_duration` ⇒
 * `MAX_DURATION`; intervalo desde a última fala do usuário ≥ `max_idle` ⇒
 * `INACTIVITY_TIMEOUT`; senão `TIMEOUT_UNCLASSIFIED`. Nenhum desses é
 * resultado comercial.
 */
export function classifySessionEnd(entries) {
  const ended = [...entries].reverse().find((e) => e.type === 'onsessionended');
  if (!ended) return { reason: 'UNKNOWN', commercial_outcome: null };
  const status = first([ended.data?.data, ended.data?.payload, ended.data], ['status', 'reason']);
  const base = { provider_status: status ?? null, commercial_outcome: null };
  if (status !== 'timeout') return { reason: String(status ?? 'ENDED'), ...base };
  const limits = sessionLimits(entries);
  const endAt = Date.parse(ended.wall);
  const elapsed = limits.startWall ? endAt - Date.parse(limits.startWall) : null;
  if (
    limits.maxDuration &&
    elapsed !== null &&
    elapsed >= limits.maxDuration * 1000 - TOLERANCE_MS
  ) {
    return { reason: 'MAX_DURATION', elapsed_ms: elapsed, ...base };
  }
  const lastUser = lastUserActivity(entries, ended.wall) ?? limits.startWall;
  const gap = lastUser ? endAt - Date.parse(lastUser) : null;
  if (limits.maxIdle && gap !== null && gap >= limits.maxIdle * 1000 - TOLERANCE_MS) {
    return {
      reason: 'INACTIVITY_TIMEOUT',
      idle_gap_ms: gap,
      inactivity_prompt_seen: promptSeen(entries, limits.prompt, lastUser),
      ...base,
    };
  }
  return { reason: 'TIMEOUT_UNCLASSIFIED', idle_gap_ms: gap, elapsed_ms: elapsed, ...base };
}

export function correlate(pageExport, webhookEntries) {
  const pairs = webhookPairs(webhookEntries);
  const used = new Set();
  const functions = pageExport.entries
    .filter((e) => e.type === 'onfunction')
    .map((entry) => {
      const fn = readOnFunction(entry);
      const best = bestPair(fn, pairs, used);
      if (!best) return { onfunction: fn, webhook: null, match: 'NONE' };
      used.add(best.pair.request.id);
      const { request, response } = best.pair;
      return {
        onfunction: fn,
        webhook: {
          id: request.id,
          wall: request.wall,
          method: request.method,
          status: response?.status ?? null,
        },
        match: best.match,
        ambiguous: Boolean(best.ambiguous),
      };
    });
  return {
    functions,
    // Timeout da FERRAMENTA (cliente desistiu do webhook) é outro evento, nunca fim de sessão.
    tool_timeouts: webhookEntries.filter((e) => e.kind === 'aborted').map((e) => e.id),
    unmatched_webhook_requests: pairs
      .filter((p) => !used.has(p.request.id))
      .map((p) => p.request.id),
    session_end: classifySessionEnd(pageExport.entries),
    caveat:
      'Correlação por evidência; o fornecedor não garante entrega, ordem nem turno do onfunction.',
  };
}

if (process.argv[1]?.endsWith('correlate.mjs')) {
  const [pageFile, hookFile, out = 'correlation.json'] = process.argv.slice(2);
  if (!pageFile || !hookFile)
    throw new Error('uso: node tools/correlate.mjs <pagina.json> <webhook.jsonl> [saida.json]');
  const result = correlate(
    JSON.parse(readFileSync(pageFile, 'utf8')),
    parseJsonl(readFileSync(hookFile, 'utf8')),
  );
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(
    `${result.functions.length} onfunction; ${result.unmatched_webhook_requests.length} requisições sem par; fim: ${result.session_end.reason}`,
  );
}
