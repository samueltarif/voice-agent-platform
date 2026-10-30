import { describe, it, expect } from 'vitest';
import { readBoundedBody } from './bounded-body.js';

function streamed(chunks: string[]) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled++];
      if (next === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(next));
    },
  });
  const req = new Request('http://localhost/x', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  return { req, pulled: () => pulled };
}

describe('readBoundedBody', () => {
  it('reads multibyte bodies within the limit intact', async () => {
    const { req } = streamed(['{"n":"Jo', 'ão"}']);
    expect(await readBoundedBody(req, 64)).toEqual({ kind: 'OK', text: '{"n":"João"}' });
  });

  it('stops reading as soon as a chunked body exceeds the limit (no content-length)', async () => {
    const { req, pulled } = streamed(['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd']);
    expect(await readBoundedBody(req, 64)).toEqual({ kind: 'TOO_LARGE' });
    expect(pulled()).toBeLessThan(4);
  });

  it('refuses a declared content-length above the limit without reading', async () => {
    const req = new Request('http://localhost/x', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '999999' },
    });
    expect(await readBoundedBody(req, 64)).toEqual({ kind: 'TOO_LARGE' });
    expect(req.bodyUsed).toBe(false);
  });
});
