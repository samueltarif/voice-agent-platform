import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, redact } from '../src/event-log.mjs';

function fakeClock() {
  let now = 1000;
  return {
    clock: () => now,
    advance: (ms) => (now += ms),
    wall: () => new Date('2026-11-27T12:00:00Z'),
  };
}

test('records origin, monotonic time and provider methods', () => {
  const c = fakeClock();
  const log = new EventLog(c);
  log.frame('in', JSON.stringify({ method: 'onready' }));
  c.advance(120);
  log.frame(
    'in',
    JSON.stringify({ method: 'ontranscript', data: 'oi', payload: { is_final: true } }),
  );
  log.record('DERIVED', 'sdk_agent_state', { state: 'idle' });
  const [ready, transcript, derived] = log.entries;
  assert.deepEqual([ready.origin, ready.type, ready.t_ms], ['PROVIDER', 'onready', 0]);
  assert.deepEqual(
    [transcript.type, transcript.t_ms, transcript.data.payload.is_final],
    ['ontranscript', 120, true],
  );
  assert.equal(derived.origin, 'DERIVED');
  assert.throws(() => log.record('VENDOR', 'x'), /origem/);
});

test('unknown provider methods are kept and flagged, never dropped', () => {
  const log = new EventLog(fakeClock());
  log.frame('in', JSON.stringify({ method: 'function_call_started', data: { name: 'x' } }));
  log.frame('in', 'not json');
  assert.deepEqual(
    log.entries.map((e) => [e.type, e.known]),
    [
      ['function_call_started', false],
      ['unparsed_text', false],
    ],
  );
});

test('audio is aggregated into bursts closed by the next event', () => {
  const c = fakeClock();
  const log = new EventLog(c);
  log.frame('in', new Uint8Array(640));
  c.advance(20);
  log.frame('in', new Uint8Array(640));
  c.advance(20);
  log.frame('in', new Uint8Array(320));
  log.frame('in', JSON.stringify({ method: 'clear' }));
  const [burst, clear] = log.entries;
  assert.equal(burst.type, 'audio_burst');
  assert.deepEqual(burst.data, { frames: 3, bytes: 1600, span_ms: 40 });
  assert.equal(clear.type, 'clear');
});

test('secrets are redacted everywhere, including the outgoing initiate', () => {
  const log = new EventLog(fakeClock());
  log.frame(
    'out',
    JSON.stringify({
      method: 'initiate',
      data: { public_key: 'pk_SECRET', agent: { agent_id: 'a' } },
    }),
  );
  const exported = JSON.stringify(log.export({ token: 't', session_id: 's' }));
  assert.equal(exported.includes('pk_SECRET'), false);
  assert.equal(exported.includes('"t"'), false);
  assert.deepEqual(redact({ a: [{ api_key: 'k' }] }), { a: [{ api_key: '[REDACTED]' }] });
});
