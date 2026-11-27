import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAgentOverrides, describeAgent } from '../src/agent-builder.mjs';
import {
  AGENDA_TOOL_NAME,
  buildAgendaTool,
  TOKEN_HEADER,
  withAgendaTool,
} from '../src/agenda-tool.mjs';

const BASE = {
  prompt: 'p',
  voice: { provider: 'elevenlabs', voice_id: 'v1' },
  llm: { model: 'm1' },
};
const TOKEN = 'x'.repeat(32);

test('overrides replace only filled fields, on a copy', () => {
  const out = applyAgentOverrides(BASE, {
    llmModel: ' m2 ',
    voiceId: 'v2',
    language: 'pt-BR',
    firstMessage: '',
  });
  assert.deepEqual(out.llm, { model: 'm2' });
  assert.deepEqual(out.voice, { provider: 'elevenlabs', voice_id: 'v2' });
  assert.equal(out.language, 'pt-BR');
  assert.equal('first_message' in out, false);
  assert.deepEqual(BASE.llm, { model: 'm1' });
  assert.deepEqual(applyAgentOverrides(BASE, {}), BASE);
  assert.throws(() => applyAgentOverrides(BASE, { voiceProvider: 'acme' }), /desconhecido/);
});

test('agenda tool: authenticated header, HTTPS only, options forwarded only when set', () => {
  const tool = buildAgendaTool({ baseUrl: 'https://abc.example.com', token: TOKEN });
  assert.equal(tool.webhook, 'https://abc.example.com/tool/e2v-agenda');
  assert.deepEqual(tool.header, { [TOKEN_HEADER]: TOKEN });
  assert.equal('response_mode' in tool, false);
  assert.equal('execute_after_message' in tool, false);
  const strict = buildAgendaTool({
    baseUrl: 'https://abc.example.com',
    token: TOKEN,
    responseMode: 'strict',
    executeAfterMessage: false,
  });
  assert.equal(strict.response_mode, 'strict');
  assert.equal(strict.execute_after_message, false);
  assert.throws(
    () => buildAgendaTool({ baseUrl: 'http://abc.example.com', token: TOKEN }),
    /HTTPS/,
  );
  assert.throws(
    () => buildAgendaTool({ baseUrl: 'https://abc.example.com', token: 'short' }),
    /token/,
  );
});

test('the description sent to the log never includes the webhook token', () => {
  const config = withAgendaTool(BASE, {
    baseUrl: 'https://abc.example.com',
    token: TOKEN,
    responseMode: 'strict',
  });
  assert.equal(config.tools.at(-1).name, AGENDA_TOOL_NAME);
  const summary = describeAgent(config);
  assert.equal(JSON.stringify(summary).includes(TOKEN), false);
  assert.deepEqual(summary.tools, [
    { name: AGENDA_TOOL_NAME, response_mode: 'strict', execute_after_message: null },
  ]);
  assert.deepEqual(describeAgent('abcd'), { mode: 'agent_id', agent_id: 'abcd' });
});
