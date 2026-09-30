import { describe, expect, it } from 'vitest';
import { parseOpenAiSseStream, parseSseLine } from './openai-sse-parser.js';

function createStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]!);
      } else {
        controller.close();
      }
    },
  });
}

describe('OpenAI SSE Parser Conformance & Hardening', () => {
  it('parses single SSE data lines correctly', () => {
    const line = 'data: {"id":"1","choices":[{"delta":{"content":"Oi"}}]}';
    const result = parseSseLine(line);
    expect(result.kind).toBe('chunk');
    if (result.kind === 'chunk') {
      expect(result.chunk.choices?.[0]?.delta.content).toBe('Oi');
    }
  });

  it('handles CRLF line endings in parseSseLine', () => {
    const line = 'data: {"id":"1","choices":[{"delta":{"content":"Olá"}}]}\r';
    const result = parseSseLine(line);
    expect(result.kind).toBe('chunk');
    if (result.kind === 'chunk') {
      expect(result.chunk.choices?.[0]?.delta.content).toBe('Olá');
    }
  });

  it('recognizes [DONE] terminal line', () => {
    const line = 'data: [DONE]';
    expect(parseSseLine(line)).toEqual({ kind: 'done' });
  });

  it('skips comment lines and blank lines', () => {
    expect(parseSseLine(': keep-alive')).toEqual({ kind: 'skip' });
    expect(parseSseLine('')).toEqual({ kind: 'skip' });
    expect(parseSseLine('   ')).toEqual({ kind: 'skip' });
  });

  it('identifies malformed JSON data frames fail-closed', () => {
    const line = 'data: {invalid-json';
    expect(parseSseLine(line)).toEqual({ kind: 'malformed' });
  });

  it('handles a frame split across multiple byte chunks', async () => {
    const encoder = new TextEncoder();
    const part1 = encoder.encode('data: {"id":"1","choices":[{"delta":');
    const part2 = encoder.encode('{"content":"Partes"}}]}\n\n');
    const part3 = encoder.encode('data: [DONE]\n\n');

    const stream = createStreamFromChunks([part1, part2, part3]);
    const chunks: string[] = [];

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) chunks.push(text);
      }
    }

    expect(chunks).toEqual(['Partes']);
  });

  it('handles multiple frames in a single byte chunk', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      'data: {"id":"1","choices":[{"delta":{"content":"A"}}]}\n\n' +
        'data: {"id":"2","choices":[{"delta":{"content":"B"}}]}\n\n' +
        'data: [DONE]\n\n',
    );

    const stream = createStreamFromChunks([data]);
    const chunks: string[] = [];

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) chunks.push(text);
      }
    }

    expect(chunks).toEqual(['A', 'B']);
  });

  it('handles CRLF stream content correctly', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      'data: {"id":"1","choices":[{"delta":{"content":"CRLF"}}]}\r\n\r\n' + 'data: [DONE]\r\n\r\n',
    );

    const stream = createStreamFromChunks([data]);
    const chunks: string[] = [];

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) chunks.push(text);
      }
    }

    expect(chunks).toEqual(['CRLF']);
  });

  it('decodes UTF-8 multibyte characters split across network chunks without corruption', async () => {
    const encoder = new TextEncoder();
    const fullText =
      'data: {"id":"1","choices":[{"delta":{"content":"Ação é você"}}]}\n\ndata: [DONE]\n\n';
    const fullBytes = encoder.encode(fullText);

    const splitIndex = fullBytes.indexOf(0xc3) + 1;
    const chunk1 = fullBytes.slice(0, splitIndex);
    const chunk2 = fullBytes.slice(splitIndex);

    const stream = createStreamFromChunks([chunk1, chunk2]);
    const chunks: string[] = [];

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) chunks.push(text);
      }
    }

    expect(chunks).toEqual(['Ação é você']);
  });

  it('stops yielding immediately on [DONE] even if more bytes arrive', async () => {
    const encoder = new TextEncoder();
    const data1 = encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"First"}}]}\n\n');
    const done = encoder.encode('data: [DONE]\n\n');
    const late = encoder.encode('data: {"id":"2","choices":[{"delta":{"content":"Late"}}]}\n\n');

    const stream = createStreamFromChunks([data1, done, late]);
    const chunks: string[] = [];

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) chunks.push(text);
      }
    }

    expect(chunks).toEqual(['First']);
  });

  it('yields usage-only chunk correctly when choices is empty', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      'data: {"id":"1","choices":[],"usage":{"prompt_tokens":15,"completion_tokens":25,"total_tokens":40}}\n\n' +
        'data: [DONE]\n\n',
    );

    const stream = createStreamFromChunks([data]);
    let usageSeen: { input: number; output: number } | undefined;

    for await (const item of parseOpenAiSseStream(stream)) {
      if (
        item.kind === 'chunk' &&
        item.chunk.usage &&
        item.chunk.usage.prompt_tokens !== undefined &&
        item.chunk.usage.completion_tokens !== undefined
      ) {
        usageSeen = {
          input: item.chunk.usage.prompt_tokens,
          output: item.chunk.usage.completion_tokens,
        };
      }
    }

    expect(usageSeen).toEqual({ input: 15, output: 25 });
  });

  it('yields malformed item and stops reading immediately on invalid JSON frame', async () => {
    const encoder = new TextEncoder();
    const data1 = encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"Ok"}}]}\n\n');
    const malformed = encoder.encode('data: {corrupted-json\n\n');
    const late = encoder.encode('data: {"id":"2","choices":[{"delta":{"content":"Late"}}]}\n\n');

    const stream = createStreamFromChunks([data1, malformed, late]);
    const items: string[] = [];
    let malformedEncountered = false;

    for await (const item of parseOpenAiSseStream(stream)) {
      if (item.kind === 'chunk') {
        const text = item.chunk.choices?.[0]?.delta.content;
        if (text) items.push(text);
      } else if (item.kind === 'malformed') {
        malformedEncountered = true;
      }
    }

    expect(items).toEqual(['Ok']);
    expect(malformedEncountered).toBe(true);
  });
});
