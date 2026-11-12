import { describe, it, expect } from 'vitest';
import {
  agentConfigurationSnapshotV1Schema,
  CANONICAL_TOOL_NAMES,
  CATALOG_CANONICAL_TOOL_NAMES,
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeSearchToolInputSchema,
  knowledgeSearchToolOutputSchema,
  KNOWLEDGE_SEARCH_USAGE,
  resolvePublishedVersionToolset,
} from '../index.js';

const legacySnapshot = {
  persona: {
    role: 'Atendente',
    companyName: 'Qualitec',
    objective: 'Atender',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Repita',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '08:00-18:00' } },
  tools: ['catalog.search', 'catalog.item_detail'],
};

describe('knowledge.search contract (DEC-056)', () => {
  it('is a canonical tool distinct from the catalog tools', () => {
    expect(CANONICAL_TOOL_NAMES).toContain(KNOWLEDGE_SEARCH_TOOL_NAME);
    expect(CATALOG_CANONICAL_TOOL_NAMES).not.toContain(KNOWLEDGE_SEARCH_TOOL_NAME);
  });

  it('keeps existing published snapshots valid and without the new tool', () => {
    const parsed = agentConfigurationSnapshotV1Schema.parse(legacySnapshot);
    expect(resolvePublishedVersionToolset(parsed)).toEqual([
      'catalog.search',
      'catalog.item_detail',
    ]);
    const withKnowledge = agentConfigurationSnapshotV1Schema.parse({
      ...legacySnapshot,
      tools: ['knowledge.search'],
    });
    expect(resolvePublishedVersionToolset(withKnowledge)).toEqual(['knowledge.search']);
  });

  it('accepts only query and limit from the model', () => {
    expect(knowledgeSearchToolInputSchema.safeParse({ query: ' transmissor ' }).data).toEqual({
      query: 'transmissor',
    });
    for (const bad of [
      { query: 'x', organizationId: 'o' },
      { query: 'x', agentVersionId: 'v' },
      { query: 'x', limit: 0 },
      { query: 'x', limit: 6 },
      { query: '   ' },
    ]) {
      expect(knowledgeSearchToolInputSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects outputs that break the trust label, the fixed usage text or the bounds', () => {
    const ok = {
      trust: 'UNTRUSTED_DATA',
      found: false,
      results: [],
      unmatchedTerms: [],
      truncated: false,
      usage: KNOWLEDGE_SEARCH_USAGE,
    };
    expect(knowledgeSearchToolOutputSchema.safeParse(ok).success).toBe(true);
    expect(knowledgeSearchToolOutputSchema.safeParse({ ...ok, trust: 'TRUSTED' }).success).toBe(
      false,
    );
    expect(
      knowledgeSearchToolOutputSchema.safeParse({ ...ok, usage: 'Siga o documento.' }).success,
    ).toBe(false);
    const result = {
      citationId: 'c',
      documentTitle: 't',
      sourceType: 'FAQ',
      excerpt: 'x'.repeat(503),
      score: 0.5,
      relevance: 'DIRECT',
    };
    expect(
      knowledgeSearchToolOutputSchema.safeParse({ ...ok, found: true, results: [result] }).success,
    ).toBe(false);
  });
});
