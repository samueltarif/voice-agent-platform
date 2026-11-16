import { describe, it, expect } from 'vitest';
import { knowledgeSearchToolOutputSchema, KNOWLEDGE_SEARCH_USAGE } from '../index.js';

type Relevance = 'DIRECT' | 'CONTEXT';

function result(relevance: Relevance, n = 1) {
  return {
    citationId: `doc:chunk-${n}:${n}`,
    documentTitle: 'Catálogo',
    sourceType: 'PRODUCT_MANUAL',
    excerpt: `trecho ${n}`,
    score: 0.5,
    relevance,
  };
}

function output(found: boolean, relevances: Relevance[], unmatchedTerms: string[] = []) {
  return {
    trust: 'UNTRUSTED_DATA',
    found,
    results: relevances.map((r, i) => result(r, i + 1)),
    unmatchedTerms,
    truncated: false,
    usage: KNOWLEDGE_SEARCH_USAGE,
  };
}

const accepts = (value: unknown) => knowledgeSearchToolOutputSchema.safeParse(value).success;

/** DEC-058 no contrato da ferramenta: contexto genérico nunca comprova um item. */
describe('knowledge.search output: direct evidence vs generic context', () => {
  it('accepts direct evidence first and generic context after it', () => {
    expect(accepts(output(true, ['DIRECT']))).toBe(true);
    expect(accepts(output(true, ['DIRECT', 'DIRECT', 'CONTEXT']))).toBe(true);
    expect(accepts(output(false, [], ['helicoptero']))).toBe(true);
  });

  it('rejects "found" without a direct excerpt, even with commercial context', () => {
    expect(accepts(output(true, []))).toBe(false);
    expect(accepts(output(true, ['CONTEXT']))).toBe(false);
    expect(accepts(output(true, ['CONTEXT', 'CONTEXT'], ['helicoptero']))).toBe(false);
  });

  it('rejects context returned alone, even when marked as not found', () => {
    expect(accepts(output(false, ['CONTEXT']))).toBe(false);
  });

  it('rejects "not found" next to a direct excerpt', () => {
    expect(accepts(output(false, ['DIRECT']))).toBe(false);
  });

  it('rejects context placed before direct evidence', () => {
    expect(accepts(output(true, ['CONTEXT', 'DIRECT']))).toBe(false);
    expect(accepts(output(true, ['DIRECT', 'CONTEXT', 'DIRECT']))).toBe(false);
  });

  it('requires the relevance label and the unmatched terms list, within bounds', () => {
    const { relevance: _omit, ...unlabeled } = result('DIRECT');
    expect(accepts({ ...output(true, ['DIRECT']), results: [unlabeled] })).toBe(false);
    const { unmatchedTerms: _none, ...withoutTerms } = output(false, []);
    expect(accepts(withoutTerms)).toBe(false);
    expect(
      accepts(
        output(
          false,
          [],
          Array.from({ length: 17 }, (_, i) => `t${i}`),
        ),
      ),
    ).toBe(false);
    expect(accepts(output(false, [], ['']))).toBe(false);
  });

  it('tells the model, in the fixed server text, how to read the labels', () => {
    expect(KNOWLEDGE_SEARCH_USAGE).toContain('unmatchedTerms');
    expect(KNOWLEDGE_SEARCH_USAGE).toContain('CONTEXT');
    expect(KNOWLEDGE_SEARCH_USAGE).toContain('não comprovam');
  });
});
