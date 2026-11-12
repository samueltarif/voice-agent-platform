import { describe, it, expect } from 'vitest';
import { extractKnowledgeQueryTerms, stemKnowledgeTerm } from './knowledge-query-terms.js';
import { computeTermWeights, scoreKnowledgeChunk } from './knowledge-retrieval-scoring.js';

describe('extractKnowledgeQueryTerms (pt-BR, sem IA)', () => {
  it('turns the operator question into folded, singular, meaningful terms', () => {
    expect(
      extractKnowledgeQueryTerms('Quais transmissores de pressão a Qualitec oferece?'),
    ).toEqual(['transmissor', 'pressao', 'qualitec', 'oferece']);
  });

  it('keeps numbers and model codes, drops punctuation and duplicates', () => {
    expect(extractKnowledgeQueryTerms('TP-100, TP-100 e 4-20 mA')).toEqual(['100', '20']);
    expect(extractKnowledgeQueryTerms('válvulas VÁLVULA valvula')).toEqual(['valvula']);
  });

  it('falls back to every word when only stopwords are given, and is bounded', () => {
    expect(extractKnowledgeQueryTerms('o que é?')).toEqual(['o', 'que', 'e']);
    const many = Array.from({ length: 30 }, (_, i) => `termo${i}`).join(' ');
    expect(extractKnowledgeQueryTerms(many)).toHaveLength(16);
  });

  it('reduces common Portuguese plurals', () => {
    expect(stemKnowledgeTerm('pressoes')).toBe('pressao');
    expect(stemKnowledgeTerm('manuais')).toBe('manual');
    expect(stemKnowledgeTerm('aneis')).toBe('anel');
    expect(stemKnowledgeTerm('sensores')).toBe('sensor');
    expect(stemKnowledgeTerm('valvulas')).toBe('valvula');
    expect(stemKnowledgeTerm('classe')).toBe('classe');
    expect(stemKnowledgeTerm('gas')).toBe('gas');
  });
});

describe('weighted lexical score', () => {
  const chunks = [
    'qualitec transmissor de pressao manometrica tp-100',
    'qualitec valvula esfera bipartida, a qualitec oferece garantia',
    'qualitec manometro glicerinado',
  ];
  const terms = ['transmissor', 'pressao', 'qualitec', 'oferece'];

  it('ranks the chunk with the rare terms above the one with brand words only', () => {
    const weights = computeTermWeights(chunks, terms);
    const [transmitter, valve] = chunks.map((c) => scoreKnowledgeChunk(c, terms, weights));
    expect(transmitter).toBeGreaterThan(valve!);
    expect(weights[0]!).toBeGreaterThan(weights[2]!);
  });

  it('scores zero without matches and is bounded to 1', () => {
    const weights = computeTermWeights(chunks, ['inexistente']);
    expect(scoreKnowledgeChunk(chunks[0]!, ['inexistente'], weights)).toBe(0);
    const spam = 'pressao '.repeat(50);
    expect(scoreKnowledgeChunk(spam, ['pressao'], [1])).toBeLessThanOrEqual(1);
  });
});
