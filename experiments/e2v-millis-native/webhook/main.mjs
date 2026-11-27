/**
 * E2-V — inicia o webhook experimental (127.0.0.1:8787) e o controle de
 * cenário (127.0.0.1:8788). O token é gerado a cada execução e mostrado UMA
 * vez no terminal para ser colado na página; não é gravado em arquivo. Com
 * `E2V_WEBHOOK_TOKEN` definido, usa esse valor e não o mostra.
 */
import { createRequestLog } from './request-log.mjs';
import { createControlServer, createWebhookServer, newWebhookToken } from './server.mjs';
import { SCENARIOS } from './scenarios.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.E2V_WEBHOOK_PORT ?? 8787);
const CONTROL_PORT = Number(process.env.E2V_CONTROL_PORT ?? 8788);
const initial = process.env.E2V_SCENARIO ?? 'success';
if (!SCENARIOS.includes(initial)) throw new Error(`E2V_SCENARIO inválido: ${initial}`);

const state = { scenario: initial };
const provided = process.env.E2V_WEBHOOK_TOKEN;
const token = provided ?? newWebhookToken();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const log = createRequestLog({ secrets: [token], file: `logs/webhook-${stamp}.jsonl` });
const timeoutMs = Number(process.env.E2V_TIMEOUT_MS ?? 30_000);

const acceptGet = process.env.E2V_ACCEPT_GET === '1';
createWebhookServer({ token, scenario: () => state.scenario, log, timeoutMs, acceptGet }).listen(
  PORT,
  HOST,
);
createControlServer({ state, log }).listen(CONTROL_PORT, HOST);
console.log(`Webhook E2-V em http://${HOST}:${PORT} (só local; cenário: ${state.scenario})`);
console.log(`Controle: POST http://${HOST}:${CONTROL_PORT}/scenario?set=<${SCENARIOS.join('|')}>`);
if (acceptGet) console.log('ATENÇÃO: GET autenticado aceito (contingência de diagnóstico).');
console.log(`Registro: logs/webhook-${stamp}.jsonl`);
if (!provided) console.log(`Token desta execução (cole na página; não é salvo): ${token}`);
