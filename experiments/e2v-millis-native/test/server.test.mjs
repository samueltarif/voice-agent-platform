import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServer } from '../server.mjs';

test('local server binds to loopback and serves only the page', async () => {
  const server = createLocalServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /E2-V/);
    for (const path of ['/webhook', '/api/tool', '/../package.json']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' })).status, 404);
  } finally {
    server.close();
  }
});
