/**
 * Confere, no SDK oficial instalado (sem executá-lo contra a rede), as
 * premissas do protótipo: endpoint, mensagem `initiate` e os métodos que o
 * SDK consome internamente (por isso a escuta do WebSocket).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { MILLIS_NATIVE_ENDPOINT } from '../src/session-config.mjs';

const require = createRequire(import.meta.url);

async function sdkSource() {
  const pkg = require('@millisai/web-sdk/package.json');
  assert.equal(pkg.version, '1.0.12');
  return readFile(require.resolve('@millisai/web-sdk').replace(/index\.js$/, 'index.mjs'), 'utf8');
}

test('SDK 1.0.12 uses the native endpoint and the initiate shape', async () => {
  const source = await sdkSource();
  assert.ok(source.includes(`"${MILLIS_NATIVE_ENDPOINT}"`));
  for (const fragment of [
    'method:"initiate"',
    'agent_id:',
    'agent_config:',
    'public_key:',
    'include_metadata_in_prompt:',
  ]) {
    assert.ok(source.includes(fragment), fragment);
  }
});

test('SDK consumes clear/pause/unpause/start_answering internally (tap is required)', async () => {
  const source = await sdkSource();
  for (const method of ['start_answering', 'clear', 'pause', 'unpause', 'pong']) {
    assert.ok(source.includes(`case"${method}"`), method);
  }
});
