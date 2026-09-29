import type { OpenAiChatCompletionChunk } from './openai-chat-completion-types.js';

export type SseLineResult =
  | { readonly kind: 'chunk'; readonly chunk: OpenAiChatCompletionChunk }
  | { readonly kind: 'done' }
  | { readonly kind: 'skip' };

export function parseSseLine(line: string): SseLineResult {
  const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
  const trimmed = normalized.trim();
  if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
    return { kind: 'skip' };
  }

  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') {
    return { kind: 'done' };
  }

  try {
    const chunk = JSON.parse(payload) as OpenAiChatCompletionChunk;
    return { kind: 'chunk', chunk };
  } catch {
    return { kind: 'skip' };
  }
}

async function* readStreamLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) yield line;
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

export async function* parseOpenAiSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<OpenAiChatCompletionChunk> {
  for await (const line of readStreamLines(stream)) {
    const result = parseSseLine(line);
    if (result.kind === 'done') return;
    if (result.kind === 'chunk') yield result.chunk;
  }
}
