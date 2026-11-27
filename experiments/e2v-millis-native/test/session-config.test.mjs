import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeInitiate,
  MILLIS_NATIVE_ENDPOINT,
  newSessionMetadata,
  resolveAgent,
} from '../src/session-config.mjs';
import {
  buildExperimentalTool,
  EXPERIMENTAL_TOOL_NAME,
  NOOP_WEBHOOK,
  noopToolResult,
  withExperimentalTool,
} from '../src/experimental-tool.mjs';

const CONFIG = { prompt: 'Teste', voice: { provider: 'elevenlabs', voice_id: 'v1' } };

test('endpoint is the native Millis WebSocket', () => {
  assert.equal(MILLIS_NATIVE_ENDPOINT, 'wss://api-west.millis.ai:8080/millis');
});

test('metadata is unique per session and declares no commercial effect', () => {
  const a = newSessionMetadata();
  const b = newSessionMetadata();
  assert.notEqual(a.session_id, b.session_id);
  assert.equal(a.experiment, 'E2-V');
  assert.equal(a.commercial_effects, 'NONE');
});

test('exactly one of agent_id or agent_config', () => {
  assert.equal(resolveAgent({ agentId: ' abc_123 ' }), 'abc_123');
  assert.deepEqual(resolveAgent({ agentConfig: JSON.stringify(CONFIG) }), CONFIG);
  assert.throws(() => resolveAgent({}), /exatamente um/);
  assert.throws(() => resolveAgent({ agentId: 'abcd', agentConfig: CONFIG }), /exatamente um/);
  assert.throws(() => resolveAgent({ agentConfig: '{x' }), /JSON/);
  assert.throws(() => resolveAgent({ agentConfig: { voice: { voice_id: 'v' } } }), /prompt/);
  assert.throws(() => resolveAgent({ agentId: 'a b' }), /formato/);
});

test('initiate mirror follows the SDK shape and never carries the key', () => {
  const metadata = newSessionMetadata();
  const byId = describeInitiate({ agent: 'abcd', metadata });
  assert.deepEqual(byId.data.agent, { agent_id: 'abcd' });
  assert.equal(byId.data.public_key, '[REDACTED]');
  const byConfig = describeInitiate({ agent: CONFIG, metadata, includeMetadataInPrompt: true });
  assert.deepEqual(byConfig.data.agent, { agent_config: CONFIG });
  assert.equal(byConfig.data.include_metadata_in_prompt, true);
});

test('experimental tool has no reachable webhook and only forwards defined options', () => {
  const plain = buildExperimentalTool();
  assert.equal(plain.webhook, NOOP_WEBHOOK);
  assert.ok(new URL(plain.webhook).hostname.endsWith('.invalid'));
  assert.equal('response_mode' in plain, false);
  assert.equal('execute_after_message' in plain, false);
  const strict = buildExperimentalTool({ responseMode: 'strict', executeAfterMessage: true });
  assert.equal(strict.response_mode, 'strict');
  assert.equal(strict.execute_after_message, true);
  assert.equal(buildExperimentalTool({ executeAfterMessage: false }).execute_after_message, false);
  assert.deepEqual(noopToolResult().effect, 'NONE');
});

test('adding the tool copies the config and replaces a previous copy', () => {
  const input = { ...CONFIG, tools: [{ name: 'other' }, { name: EXPERIMENTAL_TOOL_NAME }] };
  const out = withExperimentalTool(input, { responseMode: 'strict' });
  assert.equal(input.tools.length, 2);
  assert.deepEqual(
    out.tools.map((t) => t.name),
    ['other', EXPERIMENTAL_TOOL_NAME],
  );
  assert.equal(out.tools[1].response_mode, 'strict');
});
