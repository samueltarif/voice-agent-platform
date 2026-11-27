/**
 * Regressões da 3ª rodada (evidências dos experimentos reais de 27/11/2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToolOptions } from '../src/tool-options.mjs';
import { AGENDA_TOOL_DESCRIPTION, withAgendaTool } from '../src/agenda-tool.mjs';
import { applyInactivityPolicy, TERMINATE_INSTRUCTION } from '../src/inactivity-policy.mjs';
import { buildFinalAgentConfig } from '../src/agent-builder.mjs';
import { scenarioResponse, SCENARIOS } from '../webhook/scenarios.mjs';
import { EventLog, KNOWN_PROVIDER_METHODS } from '../src/event-log.mjs';
import { redact, REDACTED } from '../src/redaction.mjs';

const TOKEN = 'tok_'.padEnd(40, 'Z');

test('native tool options: POST always; strict/flexible; execute_after_message needs messages; timeout bounds', () => {
  const base = { name: 't' };
  assert.deepEqual(applyToolOptions(base), { name: 't', method: 'POST' });
  assert.equal(applyToolOptions(base, { responseMode: 'flexible' }).response_mode, 'flexible');
  assert.throws(() => applyToolOptions(base, { responseMode: 'loose' }), /strict ou flexible/);
  assert.throws(
    () => applyToolOptions(base, { executeAfterMessage: true }),
    /mensagem predefinida/,
  );
  const after = applyToolOptions(base, {
    executeAfterMessage: true,
    messages: [' Um momento, vou consultar. ', ''],
    timeoutSeconds: '8',
  });
  assert.deepEqual(after.messages, ['Um momento, vou consultar.']);
  assert.equal(after.execute_after_message, true);
  assert.equal(after.timeout, 8);
  assert.equal(applyToolOptions(base, { executeAfterMessage: false }).execute_after_message, false);
  assert.throws(() => applyToolOptions(base, { timeoutSeconds: 0 }), /timeout/);
  assert.throws(() => applyToolOptions(base, { timeoutSeconds: 2.5 }), /timeout/);
});

test('failure is never "no availability": description and every scenario carry a distinct result', () => {
  assert.match(AGENDA_TOOL_DESCRIPTION, /NUNCA diga que não há horários quando a consulta falhar/);
  const results = Object.fromEntries(
    SCENARIOS.map((name) => [name, scenarioResponse(name, { timeoutMs: 1 }).body.result]),
  );
  assert.deepEqual(results, {
    success: 'AVAILABLE',
    unavailable: 'NO_AVAILABILITY',
    error: 'TECHNICAL_ERROR',
    error_200: 'TECHNICAL_ERROR',
    timeout: 'TECHNICAL_ERROR',
  });
  assert.equal(scenarioResponse('error_200', { timeoutMs: 1 }).status, 200);
  for (const name of ['error', 'error_200', 'timeout']) {
    assert.match(
      scenarioResponse(name, { timeoutMs: 1 }).body.instructions,
      /NÃO significa falta de horários/,
    );
  }
});

test('inactivity policy: 7 s prompt, +7 s end via max_idle, agent terminates only on goodbye', () => {
  const config = {
    prompt: 'p',
    voice: { voice_id: 'v' },
    flow: { interruption: { allowed: true } },
    session_timeout: { max_duration: 180 },
  };
  const out = applyInactivityPolicy(config);
  assert.deepEqual(out.flow.inactivity_handling, { idle_time: 7, message: 'Você ainda está aí?' });
  assert.equal(out.session_timeout.max_idle, 14);
  assert.equal(out.session_timeout.max_duration, 180);
  assert.deepEqual(out.flow.interruption, { allowed: true });
  assert.equal(out.flow.agent_terminate_call.enabled, true);
  assert.equal(out.flow.agent_terminate_call.instruction, TERMINATE_INSTRUCTION);
  assert.match(TERMINATE_INSTRUCTION, /Nunca encerre por causa de silêncio/);
  assert.equal(config.flow.inactivity_handling, undefined, 'input not mutated');
  assert.equal(
    applyInactivityPolicy(config, { promptAfterSeconds: 10, endAfterSeconds: 5 }).session_timeout
      .max_idle,
    15,
  );
  assert.throws(() => applyInactivityPolicy(config, { promptAfterSeconds: 1 }), /entre 3 e 120/);
});

test('page overrides apply BEFORE final validation (voice_id only in the page field)', () => {
  const parsed = { prompt: 'p', voice: { provider: 'elevenlabs' } };
  const final = buildFinalAgentConfig(parsed, {
    overrides: { voiceId: 'alcione', llmModel: 'gpt-4o' },
    inactivity: {},
    tools: [(c) => withAgendaTool(c, { baseUrl: 'https://x.example.com', token: TOKEN })],
  });
  assert.equal(final.voice.voice_id, 'alcione');
  assert.equal(final.llm.model, 'gpt-4o');
  assert.equal(final.session_timeout.max_idle, 14);
  assert.equal(final.tools[0].method, 'POST');
  assert.throws(() => buildFinalAgentConfig(parsed, { overrides: {} }), /voice_id/);
});

test('onfunction is a known provider event', () => {
  assert.ok(KNOWN_PROVIDER_METHODS.includes('onfunction'));
  const log = new EventLog();
  log.frame('in', JSON.stringify({ method: 'onfunction', data: { name: 'e2v_consultar_agenda' } }));
  assert.equal(log.entries[0].known, true);
});

test('redaction: credential keys, header values and known secret values anywhere', () => {
  const data = {
    agent_config: { tools: [{ name: 't', header: { 'x-e2v-token': TOKEN, 'X-Other': 'abc' } }] },
    public_key: 'pk_live_123456789',
    nested: { Authorization: 'Bearer x', apiKey: 'k', note: `erro com ${TOKEN} no texto` },
    query: { preferencia: 'terça', t: TOKEN },
  };
  const out = redact(data, [TOKEN]);
  assert.deepEqual(out.agent_config.tools[0].header, {
    'x-e2v-token': REDACTED,
    'X-Other': REDACTED,
  });
  assert.equal(out.public_key, REDACTED);
  assert.equal(out.nested.Authorization, REDACTED);
  assert.equal(out.nested.apiKey, REDACTED);
  assert.equal(out.nested.note, `erro com ${REDACTED} no texto`);
  assert.equal(out.query.t, REDACTED);
  assert.equal(out.query.preferencia, 'terça');
  assert.equal(JSON.stringify(out).includes(TOKEN), false);
});

test('page export never contains the public key or webhook token, even inside the initiate frame', () => {
  const log = new EventLog();
  const publicKey = 'pk_live_ABCDEFGHIJKLMNOP';
  log.addSecret(publicKey);
  log.addSecret(TOKEN);
  const initiate = {
    method: 'initiate',
    data: {
      public_key: publicKey,
      agent: {
        agent_config: withAgendaTool(
          { prompt: 'p', voice: { voice_id: 'v' } },
          { baseUrl: 'https://x.example.com', token: TOKEN },
        ),
      },
    },
  };
  log.frame('out', JSON.stringify(initiate));
  log.frame('in', JSON.stringify({ method: 'onfunction', data: { echo: `x-e2v-token=${TOKEN}` } }));
  log.record('DERIVED', 'sdk_error', { message: `falha ${publicKey}` });
  const exported = JSON.stringify(log.export({ note: publicKey }));
  assert.equal(exported.includes(publicKey), false);
  assert.equal(exported.includes(TOKEN), false);
});

test('post-call report URL carries the ephemeral token only in the query and is scrubbed from logs', async () => {
  const { sessionReportUrl } = await import('../src/agenda-tool.mjs');
  const url = sessionReportUrl('https://x.example.com', TOKEN);
  assert.equal(new URL(url).pathname, '/session/e2v-report');
  assert.equal(new URL(url).searchParams.get('t'), TOKEN);
  const log = new EventLog();
  log.addSecret(TOKEN);
  log.frame(
    'out',
    JSON.stringify({
      method: 'initiate',
      data: { agent: { agent_config: { session_data_webhook: url } } },
    }),
  );
  assert.equal(JSON.stringify(log.export()).includes(TOKEN), false);
});
