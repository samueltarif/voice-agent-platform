import { describe, it, expect, vi } from 'vitest';
import * as normalizer from './repositories/knowledge-text-normalizer.js';
import { chunkKnowledgeText } from './repositories/knowledge-chunker.js';
import {
  KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS,
  KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS,
} from '@voice-agent/contracts';

const DOC_ID = '11111111-1111-4111-8111-111111111111';

describe('007J N4 chunk caps checked before work (ordering + exact limits)', () => {
  it('does not hash or allocate the excess chunk', () => {
    const spy = vi.spyOn(normalizer, 'computeContentHash');
    spy.mockClear();
    const text = 'word '.repeat(30_000);
    expect(() =>
      chunkKnowledgeText({
        text,
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 100, overlapChars: 0 },
      }),
    ).toThrow(/too many chunks/i);
    expect(spy.mock.calls.length).toBe(KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS);
    spy.mockRestore();
  });

  it('accepts exact chunk-count limit and rejects limit-plus-one', () => {
    const policy = { policyVersion: 'v1', maxChunkChars: 100, overlapChars: 0 };
    const exactText = 'a'.repeat(100 * 1000);
    const exact = chunkKnowledgeText({ text: exactText, documentId: DOC_ID, policy });
    expect(exact).toHaveLength(1000);
    expect(() =>
      chunkKnowledgeText({ text: `${exactText}a`, documentId: DOC_ID, policy }),
    ).toThrow(/too many chunks/i);
  });

  it('accepts exact aggregate limit and rejects aggregate-plus-one', () => {
    const policy = { policyVersion: 'v1', maxChunkChars: 8000, overlapChars: 0 };
    const exactText = 'b'.repeat(400_000);
    const exact = chunkKnowledgeText({ text: exactText, documentId: DOC_ID, policy });
    const total = exact.reduce((sum, c) => sum + c.text.length, 0);
    expect(total).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS);
    expect(() =>
      chunkKnowledgeText({ text: `${exactText}c`, documentId: DOC_ID, policy }),
    ).toThrow(/aggregate/i);
  });
});
