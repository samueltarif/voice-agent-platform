import { describe, it, expect } from 'vitest';
import {
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  knowledgeChunkingPolicySchema,
} from '@voice-agent/contracts';
import { chunkKnowledgeText } from './repositories/index.js';

const DOC_ID = '11111111-1111-4111-8111-111111111111';

describe('Knowledge Chunker Resource Bounds (007J HIGH-2)', () => {
  it('accepts engineering defaults and chunks deterministically', () => {
    const parsed = knowledgeChunkingPolicySchema.parse({ policyVersion: 'v1' });
    expect(parsed.maxChunkChars).toBe(KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS);
    expect(parsed.overlapChars).toBe(KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS);

    const text =
      'Primeiro parágrafo de teste sobre cancelamento de compras.\n\nSegundo parágrafo detalhando regras de estorno e prazos.';
    const first = chunkKnowledgeText({ text, documentId: DOC_ID, policy: parsed });
    const second = chunkKnowledgeText({ text, documentId: DOC_ID, policy: parsed });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(1);
    for (const [index, chunk] of first.entries()) {
      expect(chunk.ordinal).toBe(index);
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(parsed.maxChunkChars);
    }
  });

  it('preserves direct small-policy determinism for short texts', () => {
    const policy = { policyVersion: 'v1', maxChunkChars: 65, overlapChars: 15 };
    const text =
      'Primeiro parágrafo de teste sobre cancelamento de compras.\n\nSegundo parágrafo detalhando regras de estorno e prazos.';
    const chunks = chunkKnowledgeText({ text, documentId: DOC_ID, policy });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks).toEqual(chunkKnowledgeText({ text, documentId: DOC_ID, policy }));
  });

  it('rejects near-total overlap at the contract boundary and in the chunker', () => {
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 1000,
        overlapChars: 999,
      }).success,
    ).toBe(false);

    expect(() =>
      chunkKnowledgeText({
        text: 'word '.repeat(2000),
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 1000, overlapChars: 999 },
      }),
    ).toThrow(/overlap/i);
  });

  it('rejects extreme chunk sizes at the contract boundary and in the chunker', () => {
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 1_000_000,
        overlapChars: 0,
      }).success,
    ).toBe(false);

    expect(() =>
      chunkKnowledgeText({
        text: 'word '.repeat(2000),
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 1_000_000, overlapChars: 0 },
      }),
    ).toThrow(/exceed|max/i);
  });

  it('rejects sub-minimum chunk sizes at the contract boundary', () => {
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 50,
        overlapChars: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects overlap above half of max chunk size at the contract boundary', () => {
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 8000,
        overlapChars: 4000,
      }).success,
    ).toBe(true);
    expect(
      knowledgeChunkingPolicySchema.safeParse({
        policyVersion: 'v1',
        maxChunkChars: 8000,
        overlapChars: 4001,
      }).success,
    ).toBe(false);
  });

  it('fails closed instead of generating an unbounded chunk count', () => {
    const text = 'word '.repeat(30_000);
    expect(() =>
      chunkKnowledgeText({
        text,
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 100, overlapChars: 0 },
      }),
    ).toThrow(/too many chunks/i);
  });

  it('fails closed instead of generating unbounded aggregate characters', () => {
    const text = 'word '.repeat(60_000);
    expect(() =>
      chunkKnowledgeText({
        text,
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 8000, overlapChars: 4000 },
      }),
    ).toThrow(/aggregate/i);
  });

  it('preserves empty and short text behavior', () => {
    expect(
      chunkKnowledgeText({
        text: '',
        documentId: DOC_ID,
        policy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
      }),
    ).toEqual([]);
    const short = chunkKnowledgeText({
      text: 'hi',
      documentId: DOC_ID,
      policy: { policyVersion: 'v1', maxChunkChars: 2000, overlapChars: 200 },
    });
    expect(short).toHaveLength(1);
    expect(short[0]?.text).toBe('hi');
  });
});
