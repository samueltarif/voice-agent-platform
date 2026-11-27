/**
 * E2-V — página local do experimento. Usa o SDK OFICIAL da Millis para
 * microfone, reprodução, `clear`/`pause`/`unpause` e o diálogo; este arquivo
 * só monta a sessão, observa e registra. Nada é persistido no navegador e a
 * chave pública digitada nunca entra no registro.
 */
/* global document, window */
import Millis from '@millisai/web-sdk';
import { EventLog } from '../src/event-log.mjs';
import { installWebSocketTap } from '../src/ws-tap.mjs';
import {
  MILLIS_NATIVE_ENDPOINT,
  newSessionMetadata,
  resolveAgent,
} from '../src/session-config.mjs';
import { withExperimentalTool } from '../src/experimental-tool.mjs';
import { buildFinalAgentConfig, describeAgent } from '../src/agent-builder.mjs';
import { redact } from '../src/redaction.mjs';
import { sessionReportUrl, withAgendaTool } from '../src/agenda-tool.mjs';

const $ = (id) => document.getElementById(id);
let client = null;
let log = null;
let meta = null;
let unsubscribe = () => {};

function render(entry) {
  const row = document.createElement('tr');
  row.className = `origin-${entry.origin.toLowerCase()}${entry.known ? '' : ' unknown'}`;
  for (const value of [
    entry.seq,
    entry.t_ms,
    entry.origin,
    entry.type,
    JSON.stringify(entry.data),
  ]) {
    const cell = document.createElement('td');
    cell.textContent = String(value ?? '');
    row.append(cell);
  }
  $('events').prepend(row);
}

function toolOptions() {
  const mode = $('responseMode').value;
  const after = $('executeAfterMessage').value;
  return {
    responseMode: mode === '' ? undefined : mode,
    executeAfterMessage: after === '' ? undefined : after === 'true',
    messages: $('toolMessages').value.split('\n'),
    timeoutSeconds: $('toolTimeout').value.trim() || undefined,
  };
}

function inactivityOptions() {
  if (!$('withInactivity').checked) return null;
  return {
    promptAfterSeconds: $('idlePrompt').value || 7,
    endAfterSeconds: $('idleEnd').value || 7,
  };
}

/** Ajustes da página ANTES da validação final (o voice_id pode vir só do campo). */
function buildAgent(secrets) {
  const agent = resolveAgent({ agentId: $('agentId').value, agentConfig: $('agentConfig').value });
  if (typeof agent === 'string') return agent;
  const tools = [];
  if ($('withTool').checked) tools.push((c) => withExperimentalTool(c, toolOptions()));
  if ($('withAgenda').checked) {
    const token = $('webhookToken').value;
    secrets.push(token);
    tools.push((c) =>
      withAgendaTool(c, { baseUrl: $('webhookBase').value.trim(), token, ...toolOptions() }),
    );
  }
  if ($('withReport').checked) {
    const token = $('webhookToken').value;
    secrets.push(token);
    const url = sessionReportUrl($('webhookBase').value.trim(), token);
    tools.push((c) => ({ ...c, session_data_webhook: url }));
  }
  return buildFinalAgentConfig(agent, {
    overrides: {
      llmModel: $('llmModel').value,
      voiceProvider: $('voiceProvider').value,
      voiceId: $('voiceId').value,
      language: $('language').value,
      firstMessage: $('firstMessage').value,
    },
    inactivity: inactivityOptions(),
    tools,
  });
}

function wireDerived(sdk) {
  sdk.on('onagentstate', (state) => log.record('DERIVED', 'sdk_agent_state', { state }));
  sdk.on('onlatency', (ms) => log.record('DERIVED', 'sdk_latency', { ms }));
  sdk.on('onready', () => log.record('DERIVED', 'sdk_ready'));
  sdk.on('onerror', () => log.record('DERIVED', 'sdk_error'));
}

async function start() {
  if (client) return;
  if (!$('confirmRealUse').checked) {
    alertBox('Marque a confirmação de experimento AUTORIZADO antes de conectar.');
    return;
  }
  const publicKey = $('publicKey').value.trim();
  if (!publicKey) return alertBox('Informe a chave pública (não é salva).');
  const secrets = [publicKey];
  let agent;
  try {
    agent = buildAgent(secrets);
  } catch (error) {
    return alertBox(redact(String(error?.message ?? error), secrets));
  }
  log = new EventLog();
  for (const secret of secrets) log.addSecret(secret);
  unsubscribe();
  unsubscribe = log.subscribe(render);
  $('events').replaceChildren();
  installWebSocketTap(window, log, { endpointPrefix: MILLIS_NATIVE_ENDPOINT });
  meta = newSessionMetadata();
  log.record('LOCAL', 'start', {
    session_id: meta.session_id,
    agent: describeAgent(agent),
  });
  client = Millis.createClient({ publicKey, endPoint: MILLIS_NATIVE_ENDPOINT });
  $('publicKey').value = '';
  $('webhookToken').value = '';
  wireDerived(client);
  // 4ª rodada: a despedida por inatividade não foi ouvida. Parar o áudio no
  // instante do `onsessionended` corta o que ainda está na fila; aguarda-se o
  // fim da reprodução (estado `idle` do SDK) ou 6 s. O registro mostra se
  // chegou áudio depois do fim (rajada após `onsessionended`).
  client.on('onsessionended', () => stopAfterPlayback('provider_session_ended'));
  client.on('onclose', () => stop('ws_closed'));
  await client.start(agent, meta, $('metaInPrompt').checked);
}

function stopAfterPlayback(reason) {
  const current = client;
  if (!current) return;
  log.record('LOCAL', 'awaiting_playback', { reason, max_ms: 6000 });
  let done = false;
  const finish = (why) => {
    if (done || client !== current) return;
    done = true;
    stop(`${reason}:${why}`);
  };
  current.on('onagentstate', (state) => state === 'idle' && finish('playback_idle'));
  setTimeout(() => finish('grace_elapsed'), 6000);
}

async function stop(reason = 'operator') {
  if (!client) return;
  const current = client;
  client = null;
  log.record('LOCAL', 'stop', { reason });
  await current.stop();
}

function alertBox(message) {
  $('status').textContent = message;
}

function download() {
  if (!log) return;
  const blob = new Blob([JSON.stringify(log.export(meta ?? {}), null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `e2v-${meta?.session_id ?? 'log'}.json`;
  link.click();
}

$('start').addEventListener('click', () =>
  start().catch(() => alertBox('Falha ao iniciar a sessão (detalhes omitidos por segurança).')),
);
$('stop').addEventListener('click', () => stop());
$('mute').addEventListener('click', () => {
  client?.mute();
  log?.record('LOCAL', 'mute');
});
$('unmute').addEventListener('click', () => {
  client?.unmute();
  log?.record('LOCAL', 'unmute');
});
$('export').addEventListener('click', download);
