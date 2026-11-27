import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySessionEnd, correlate } from '../tools/correlate.mjs';

const at = (s) => `2026-11-27T12:00:${String(s).padStart(2, '0')}.000Z`;
const SLOTS = { result: 'AVAILABLE', slots: [{ id: 'fict-1' }] };

function page(entries) {
  return { entries: entries.map((e, i) => ({ seq: i + 1, origin: 'PROVIDER', ...e })) };
}

const hook = [
  {
    wall: at(10),
    kind: 'request',
    id: 'r1',
    method: 'POST',
    body: { preferencia: 'terça', session_id: 'ms-1' },
  },
  { wall: at(11), kind: 'response', id: 'r1', status: 200, body: SLOTS },
  {
    wall: at(30),
    kind: 'request',
    id: 'r2',
    method: 'POST',
    body: { preferencia: 'sexta', session_id: 'ms-1' },
  },
  { wall: at(31), kind: 'response', id: 'r2', status: 500, body: { result: 'TECHNICAL_ERROR' } },
];

test('onfunction is paired with the webhook by params and result, with the criterion explicit', () => {
  const result = correlate(
    page([
      {
        wall: at(12),
        type: 'onfunction',
        data: {
          data: {
            name: 'e2v_consultar_agenda',
            params: { preferencia: 'terça' },
            result: JSON.stringify(SLOTS),
          },
        },
      },
      {
        wall: at(32),
        type: 'onfunction',
        data: {
          data: { function_name: 'e2v_consultar_agenda', arguments: { preferencia: 'sexta' } },
        },
      },
    ]),
    hook,
  );
  assert.deepEqual(
    result.functions.map((f) => [f.onfunction.name, f.webhook?.id, f.match]),
    [
      ['e2v_consultar_agenda', 'r1', 'PARAMS_AND_RESULT'],
      ['e2v_consultar_agenda', 'r2', 'PARAMS'],
    ],
  );
  assert.equal(result.functions[1].webhook.status, 500);
  assert.deepEqual(result.unmatched_webhook_requests, []);
  assert.match(result.caveat, /não garante/);
});

test('without evidence the pairing is TIME_ONLY or NONE, never invented', () => {
  const far = correlate(
    page([{ wall: at(59), type: 'onfunction', data: { data: { name: 'x' } } }]),
    [{ wall: '2026-11-27T11:50:00.000Z', kind: 'request', id: 'old', body: {} }],
  );
  assert.equal(far.functions[0].match, 'NONE');
  assert.deepEqual(far.unmatched_webhook_requests, ['old']);
  const near = correlate(
    page([{ wall: at(12), type: 'onfunction', data: { data: { name: 'x' } } }]),
    hook,
  );
  assert.equal(near.functions[0].match, 'TIME_ONLY');
});

const start = (maxIdle, maxDuration, wall = at(0)) => ({
  origin: 'LOCAL',
  type: 'start',
  wall,
  data: {
    agent: {
      max_idle: maxIdle,
      max_duration: maxDuration,
      inactivity: { message: 'Você ainda está aí?' },
    },
  },
});
const ended = (wall, status = 'timeout') => ({
  type: 'onsessionended',
  wall,
  data: { data: { status } },
});

test('regression (4th round): a provider timeout is NOT automatically inactivity', () => {
  const inactive = classifySessionEnd([
    start(14, 150),
    { type: 'ontranscript', wall: at(10), data: { data: 'oi' } },
    { type: 'onresponsetext', wall: at(17), data: { data: 'Você ainda está aí?' } },
    ended(at(24)),
  ]);
  assert.equal(inactive.reason, 'INACTIVITY_TIMEOUT');
  assert.equal(inactive.idle_gap_ms, 14_000);
  assert.equal(inactive.inactivity_prompt_seen, true);
  assert.equal(inactive.commercial_outcome, null);

  const maxDuration = classifySessionEnd([
    start(14, 30),
    { type: 'ontranscript', wall: at(29), data: {} },
    ended(at(30)),
  ]);
  assert.equal(maxDuration.reason, 'MAX_DURATION');

  const unexplained = classifySessionEnd([
    start(14, 150),
    { type: 'ontranscript', wall: at(20), data: {} },
    ended(at(25)),
  ]);
  assert.equal(unexplained.reason, 'TIMEOUT_UNCLASSIFIED');
  assert.equal(classifySessionEnd([ended(at(5))]).reason, 'TIMEOUT_UNCLASSIFIED');
  assert.equal(classifySessionEnd([ended(at(5), 'user_hangup')]).reason, 'user_hangup');
  assert.equal(classifySessionEnd([]).reason, 'UNKNOWN');
});

test('a webhook (tool) timeout is reported apart from the session end', () => {
  const result = correlate(page([ended(at(40))]), [
    { wall: at(10), kind: 'request', id: 'slow', body: {} },
    { wall: at(15), kind: 'aborted', id: 'slow', after_ms: 5000 },
  ]);
  assert.deepEqual(result.tool_timeouts, ['slow']);
  assert.notEqual(result.session_end.reason, 'INACTIVITY_TIMEOUT');
});
