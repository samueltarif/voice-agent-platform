import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/event-log.mjs';
import { installWebSocketTap } from '../src/ws-tap.mjs';
import { MILLIS_NATIVE_ENDPOINT } from '../src/session-config.mjs';
import { MockSocket, SCRIPTED_SESSION } from './mock-millis.mjs';

function setup() {
  MockSocket.instances = [];
  const scope = { WebSocket: MockSocket };
  const log = new EventLog();
  const uninstall = installWebSocketTap(scope, log, { endpointPrefix: MILLIS_NATIVE_ENDPOINT });
  return { scope, log, uninstall };
}

test('every provider frame of a scripted session is logged in order, unchanged', () => {
  const { scope, log } = setup();
  const socket = new scope.WebSocket(MILLIS_NATIVE_ENDPOINT);
  const delivered = [];
  socket.addEventListener('message', (event) => delivered.push(event.data));
  socket.open();
  socket.send(
    JSON.stringify({
      method: 'initiate',
      data: { public_key: 'pk_live_x', agent: { agent_id: 'a' } },
    }),
  );
  for (const frame of SCRIPTED_SESSION) socket.receive(frame);
  socket.close();
  assert.equal(delivered.length, SCRIPTED_SESSION.length);
  const provider = log.entries.filter((e) => e.origin === 'PROVIDER').map((e) => e.type);
  assert.deepEqual(provider, [
    'onready',
    'start_answering',
    'audio_burst',
    'onresponsetext',
    'ontranscript',
    'clear',
    'ontranscript',
    'pause',
    'ai_action',
    'unpause',
    'audio_burst',
    'onsessionended',
  ]);
  const [firstBurst] = log.entries.filter((e) => e.type === 'audio_burst');
  assert.deepEqual(firstBurst.data, { frames: 2, bytes: 1280, span_ms: firstBurst.data.span_ms });
  const initiate = log.entries.find((e) => e.type === 'initiate');
  assert.equal(initiate.origin, 'CLIENT');
  assert.equal(initiate.data.data.public_key, '[REDACTED]');
  assert.equal(socket.sent[0].includes('pk_live_x'), true, 'the real frame is sent untouched');
  assert.deepEqual(
    log.entries.filter((e) => e.origin === 'DERIVED').map((e) => e.type),
    ['ws_open', 'ws_close'],
  );
});

test('sockets to other URLs are not observed; uninstall restores the original', () => {
  const { scope, log, uninstall } = setup();
  const other = new scope.WebSocket('wss://example.test/other');
  other.open();
  other.receive({ method: 'clear' });
  assert.equal(log.entries.length, 0);
  uninstall();
  assert.equal(scope.WebSocket, MockSocket);
});

test('installing twice does not double-log', () => {
  const { scope, log } = setup();
  installWebSocketTap(scope, log, { endpointPrefix: MILLIS_NATIVE_ENDPOINT });
  const socket = new scope.WebSocket(MILLIS_NATIVE_ENDPOINT);
  socket.receive({ method: 'pause' });
  assert.equal(log.entries.filter((e) => e.type === 'pause').length, 1);
});
