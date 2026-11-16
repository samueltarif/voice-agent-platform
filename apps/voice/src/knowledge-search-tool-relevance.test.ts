import { describe, it, expect } from 'vitest';
import {
  knowledgeSearchToolOutputSchema,
  type KnowledgeHitRelevance,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalResult,
} from '@voice-agent/contracts';
import { createKnowledgeSearchToolDefinition } from './knowledge-search-tool.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTEXT = {
  organizationId: ORG,
  agentId: '22222222-2222-4222-8222-222222222222',
  agentVersionId: '33333333-3333-4333-8333-333333333333',
};
const DOC = '55555555-5555-4555-8555-555555555555';

function hit(text: string, ordinal: number, relevance?: KnowledgeHitRelevance) {
  const chunkId = `66666666-6666-4666-8666-${String(ordinal).padStart(12, '0')}`;
  const base: KnowledgeRetrievalHit = {
    chunkId,
    documentId: DOC,
    organizationId: ORG,
    textSnapshot: text,
    documentTitle: 'Catálogo',
    score: 0.5,
    provenance: {
      organizationId: ORG,
      documentId: DOC,
      chunkId,
      chunkOrdinal: ordinal,
      policyVersion: 'v1',
    },
    citation: {
      documentId: DOC,
      chunkId,
      sourceType: 'PRODUCT_MANUAL',
      sourceLocator: 'catalogo.md',
      chunkOrdinal: ordinal,
    },
  };
  return relevance ? { ...base, relevance } : base;
}

async function search(query: string, retrieved: KnowledgeRetrievalResult) {
  const tool = createKnowledgeSearchToolDefinition({
    retrievalPort: { retrieve: async () => retrieved },
  });
  const output = await tool.execute({ query, limit: 5 }, CONTEXT);
  return knowledgeSearchToolOutputSchema.parse(output);
}

const PRODUCT = hit('Transmissor de Pressão QT-310, 0 a 400 bar.', 1, 'DIRECT');
const PRICE_FAQ = hit('Os preços são enviados por orçamento.', 2, 'CONTEXT');

describe('knowledge.search: relevance and missing terms reach the model (DEC-058)', () => {
  it('reports a product the documents never mention as not found, naming the term', async () => {
    const output = await search('preço do helicóptero', {
      hits: [],
      truncated: false,
      unmatchedTerms: ['helicoptero'],
    });
    expect(output).toMatchObject({ found: false, results: [], unmatchedTerms: ['helicoptero'] });
  });

  it('labels the product excerpt DIRECT and the price FAQ CONTEXT, in that order', async () => {
    const output = await search('preço do transmissor QT-310', {
      hits: [PRODUCT, PRICE_FAQ],
      truncated: false,
      unmatchedTerms: [],
    });
    expect(output.found).toBe(true);
    expect(output.results.map((r) => [r.excerpt.slice(0, 11), r.relevance])).toEqual([
      ['Transmissor', 'DIRECT'],
      ['Os preços s', 'CONTEXT'],
    ]);
  });

  it('never returns generic context alone, even if a retrieval port sends it', async () => {
    const output = await search('preço do helicóptero', {
      hits: [PRICE_FAQ],
      truncated: false,
      unmatchedTerms: ['helicoptero'],
    });
    expect(output).toMatchObject({ found: false, results: [], unmatchedTerms: ['helicoptero'] });
  });

  it('treats an unlabeled excerpt as context, not as evidence (fail-safe)', async () => {
    const output = await search('transmissor', {
      hits: [hit('Transmissor de Pressão QT-310.', 1)],
      truncated: false,
    });
    expect(output).toMatchObject({ found: false, results: [], unmatchedTerms: [] });
  });

  it('keeps a legitimate answer when one word is unknown, and names that word', async () => {
    const output = await search('transmissor de pressão modelo zxqw', {
      hits: [PRODUCT],
      truncated: false,
      unmatchedTerms: ['zxqw'],
    });
    expect(output.found).toBe(true);
    expect(output.unmatchedTerms).toEqual(['zxqw']);
  });

  it('bounds the unmatched terms list', async () => {
    const terms = Array.from({ length: 20 }, (_, i) => `termo${i}`);
    const output = await search('x', { hits: [], truncated: false, unmatchedTerms: terms });
    expect(output.unmatchedTerms).toEqual(terms.slice(0, 16));
  });
});
