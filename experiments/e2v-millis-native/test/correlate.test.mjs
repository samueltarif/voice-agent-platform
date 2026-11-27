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

test('a provider timeout ends the session as INACTIVITY, with no commercial outcome', () => {
  assert.deepEqual(
    classifySessionEnd([{ type: 'onsessionended', data: { data: { status: 'timeout' } } }]),
    { reason: 'INACTIVITY_TIMEOUT', provider_status: 'timeout', commercial_outcome: null },
  );
  assert.equal(classifySessionEnd([]).reason, 'UNKNOWN');
});
