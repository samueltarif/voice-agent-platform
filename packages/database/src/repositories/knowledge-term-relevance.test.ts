import { describe, it, expect } from 'vitest';
import { extractKnowledgeQueryTerms } from './knowledge-query-terms.js';
import {
  classifyKnowledgeHit,
  KNOWLEDGE_GENERIC_TERMS,
  planKnowledgeTerms,
} from './knowledge-term-relevance.js';

/** Frequência simulada: quantos trechos do escopo (de `total`) contêm cada termo. */
function plan(question: string, frequency: Record<string, number>, total = 10) {
  const terms = extractKnowledgeQueryTerms(question);
  return planKnowledgeTerms(
    terms,
    terms.map((t) => frequency[t] ?? 0),
    total,
  );
}

describe('generic vs central terms (deterministic, no AI)', () => {
  it('treats commercial words and question verbs as generic, in their normalized form', () => {
    for (const word of [
      'preços',
      'prazo',
      'disponibilidade',
      'estoque',
      'valores',
      'oferece',
      'funcionam',
    ]) {
      const [term] = extractKnowledgeQueryTerms(word);
      expect(KNOWLEDGE_GENERIC_TERMS.has(term!), word).toBe(true);
    }
    for (const word of ['transmissor', 'helicóptero', 'válvula', 'compressor', 'calibração']) {
      const [term] = extractKnowledgeQueryTerms(word);
      expect(KNOWLEDGE_GENERIC_TERMS.has(term!), word).toBe(false);
    }
  });

  it('"preço do helicóptero": the product is central and unmatched, so there is no evidence', () => {
    const p = plan('preço do helicóptero', { preco: 2 });
    expect(p).toEqual({ central: ['helicoptero'], unmatched: ['helicoptero'] });
    expect(classifyKnowledgeHit('perguntas sobre preco sob orcamento', p)).toBeNull();
  });

  it('the company name present in most excerpts is ubiquitous, not evidence', () => {
    const p = plan('A Qualitec vende helicópteros?', { qualitec: 9 });
    expect(p.central).toEqual(['helicoptero']);
    expect(classifyKnowledgeHit('qualitec instrumentacao', p)).toBeNull();
  });

  it('ubiquity needs a minimum scope: in a tiny base the name still counts', () => {
    const p = plan('qualitec helicoptero', { qualitec: 3 }, 3);
    expect(p.central).toEqual(['qualitec', 'helicoptero']);
    expect(classifyKnowledgeHit('qualitec instrumentacao', p)).toBe('DIRECT');
  });

  it('a real product keeps direct hits first and lets the price FAQ through as context', () => {
    const p = plan('Qual o preço do transmissor?', { transmissor: 2, preco: 1 });
    expect(p).toEqual({ central: ['transmissor'], unmatched: [] });
    expect(classifyKnowledgeHit('transmissor de pressao qt-310', p)).toBe('DIRECT');
    expect(classifyKnowledgeHit('os precos sao enviados por orcamento', p)).toBe('CONTEXT');
  });

  it('purely commercial questions are answered directly', () => {
    const p = plan('Qual o prazo de entrega?', { prazo: 1, entrega: 1 });
    expect(p).toEqual({ central: [], unmatched: [] });
    expect(classifyKnowledgeHit('prazo de entrega de 5 dias', p)).toBe('DIRECT');
  });

  it('an unknown extra word does not reject a question whose subject is found', () => {
    const p = plan('transmissor de pressão zxqw', { transmissor: 2, pressao: 3 });
    expect(p.unmatched).toEqual(['zxqw']);
    expect(classifyKnowledgeHit('transmissor de pressao', p)).toBe('DIRECT');
  });
});
