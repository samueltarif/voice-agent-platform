import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControlServer, createWebhookServer, newWebhookToken } from '../webhook/server.mjs';
import { createRequestLog } from '../webhook/request-log.mjs';
import { mergeTimeline, parseJsonl } from '../tools/merge-timeline.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup({ timeoutMs = 50, acceptGet = false } = {}) {
  const token = newWebhookToken();
  const state = { scenario: 'success' };
  const log = createRequestLog();
  const hook = createWebhookServer({
    token,
    scenario: () => state.scenario,
    log,
    timeoutMs,
    acceptGet,
  });
  const control = createControlServer({ state, log });
  const url = await listen(hook);
  const controlUrl = await listen(control);
  const call = (body, headers = { 'x-e2v-token': token }) =>
    fetch(`${url}/tool/e2v-agenda`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const close = () => {
    hook.closeAllConnections();
    hook.close();
    control.close();
  };
  return { token, state, log, url, controlUrl, call, close };
}

test('rejects missing or wrong token without running the scenario or logging it', async () => {
  const s = await setup();
  try {
    assert.equal((await s.call({}, {})).status, 401);
    assert.equal((await s.call({}, { 'x-e2v-token': `${s.token}x` })).status, 401);
    assert.equal(s.log.entries.filter((e) => e.kind === 'request').length, 0);
    assert.deepEqual(
      s.log.entries.map((e) => [e.kind, e.status, e.auth_header_present]),
      [
        ['rejected', 401, false],
        ['rejected', 401, true],
      ],
    );
    assert.equal(JSON.stringify(s.log.entries).includes(s.token), false);
  } finally {
    s.close();
  }
});

test('regression (2nd real experiment): authenticated GET is 405 and logged; other paths 404', async () => {
  const s = await setup();
  try {
    const get = await fetch(`${s.url}/tool/e2v-agenda?preferencia=ter%C3%A7a`, {
      headers: { 'x-e2v-token': s.token },
    });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    const unauth = await fetch(`${s.url}/tool/e2v-agenda`);
    assert.equal(unauth.status, 401);
    assert.equal(
      (await fetch(`${s.url}/`, { method: 'POST', headers: { 'x-e2v-token': s.token } })).status,
      404,
    );
    assert.deepEqual(
      s.log.entries.map((e) => [e.kind, e.method, e.status]),
      [
        ['rejected', 'GET', 405],
        ['rejected', 'GET', 401],
        ['rejected', 'POST', 404],
      ],
    );
    assert.deepEqual(s.log.entries[0].query, { preferencia: 'terça' });
    assert.equal(
      s.log.entries.some((e) => e.kind === 'request'),
      false,
    );
    assert.equal(JSON.stringify(s.log.entries).includes(s.token), false);
  } finally {
    s.close();
  }
});

test('contingency: with acceptGet, an authenticated GET runs the scenario with query params', async () => {
  const s = await setup({ acceptGet: true });
  try {
    const get = await fetch(`${s.url}/tool/e2v-agenda?preferencia=quarta`, {
      headers: { 'x-e2v-token': s.token },
    });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).status, 'OFFERED');
    assert.equal((await fetch(`${s.url}/tool/e2v-agenda?x=1`)).status, 401);
    const request = s.log.entries.find((e) => e.kind === 'request');
    assert.deepEqual([request.method, request.body], ['GET', { preferencia: 'quarta' }]);
  } finally {
    s.close();
  }
});

test('success, unavailable and error scenarios; request and response logged in order', async () => {
  const s = await setup();
  try {
    const ok = await s.call({ preferencia: 'terça de manhã', session_id: 'e2v-1' });
    const offered = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(offered.status, 'OFFERED');
    assert.equal(offered.fictitious, true);
    assert.equal(offered.slots.length, 3);
    await fetch(`${s.controlUrl}/scenario?set=unavailable`, { method: 'POST' });
    assert.deepEqual((await (await s.call({})).json()).slots, []);
    await fetch(`${s.controlUrl}/scenario?set=error`, { method: 'POST' });
    assert.equal((await s.call({})).status, 500);
    assert.equal(
      (await fetch(`${s.controlUrl}/scenario?set=bogus`, { method: 'POST' })).status,
      400,
    );
    const kinds = s.log.entries.map((e) => [e.kind, e.scenario ?? null]);
    assert.deepEqual(kinds, [
      ['request', 'success'],
      ['response', 'success'],
      ['scenario', 'unavailable'],
      ['request', 'unavailable'],
      ['response', 'unavailable'],
      ['scenario', 'error'],
      ['request', 'error'],
      ['response', 'error'],
    ]);
    assert.equal(s.log.entries[0].body.preferencia, 'terça de manhã');
    assert.equal(s.log.entries[0].headers['x-e2v-token'], undefined);
    assert.ok(s.log.entries[1].latency_ms >= 0);
  } finally {
    s.close();
  }
});

test('timeout scenario delays the answer; a client that gives up is logged as aborted', async () => {
  const s = await setup({ timeoutMs: 300 });
  s.state.scenario = 'timeout';
  try {
    await assert.rejects(
      fetch(`${s.url}/tool/e2v-agenda`, {
        method: 'POST',
        headers: { 'x-e2v-token': s.token },
        body: '{}',
        signal: AbortSignal.timeout(50),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(s.log.entries.map((e) => e.kind).slice(0, 2), ['request', 'aborted']);
    const late = await s.call({});
    assert.equal(late.status, 504);
  } finally {
    s.close();
  }
});

test('oversized and non-JSON bodies are handled without crashing', async () => {
  const s = await setup();
  try {
    const big = await fetch(`${s.url}/tool/e2v-agenda`, {
      method: 'POST',
      headers: { 'x-e2v-token': s.token },
      body: 'x'.repeat(20_000),
    }).catch(() => null);
    assert.ok(big === null || big.status === 413);
    const text = await fetch(`${s.url}/tool/e2v-agenda`, {
      method: 'POST',
      headers: { 'x-e2v-token': s.token },
      body: 'nao-json',
    });
    assert.equal(text.status, 200);
    const request = s.log.entries.filter((e) => e.kind === 'request').at(-1);
    assert.equal(request.body_json, false);
  } finally {
    s.close();
  }
});

test('timeline merges page and webhook logs by wall clock', () => {
  const page = {
    entries: [
      { wall: '2026-11-27T12:00:00.100Z', origin: 'PROVIDER', type: 'ontranscript', data: {} },
      { wall: '2026-11-27T12:00:00.300Z', origin: 'PROVIDER', type: 'onresponsetext', data: {} },
    ],
  };
  const hook = parseJsonl('{"wall":"2026-11-27T12:00:00.200Z","kind":"request","id":"r1"}\n\n');
  assert.deepEqual(
    mergeTimeline(page, hook).map((e) => e.type),
    ['ontranscript', 'request', 'onresponsetext'],
  );
});
