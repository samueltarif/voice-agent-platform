import { describe, it, expect } from 'vitest';
import { buildKnowledgeExcerpt, foldKnowledgeText } from './knowledge-excerpt.js';

describe('knowledge excerpt', () => {
  it('folds accents and case', () => {
    expect(foldKnowledgeText('Pressão AÇO Válvula')).toBe('pressao aco valvula');
  });

  it('returns short texts untouched', () => {
    expect(buildKnowledgeExcerpt('Transmissor de Pressão', ['pressao'], 100)).toBe(
      'Transmissor de Pressão',
    );
  });

  it('centres the excerpt on the matched term even deep inside a long chunk', () => {
    const text = `${'Introdução institucional. '.repeat(40)}Transmissor de Pressão TP-100 faixa 0 a 400 bar. ${'Rodapé. '.repeat(40)}`;
    const excerpt = buildKnowledgeExcerpt(text, ['transmissor', 'pressao'], 200);
    expect(excerpt).toContain('Transmissor de Pressão TP-100');
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(202);
  });

  it('falls back to the beginning when no term occurs', () => {
    const text = 'a'.repeat(300);
    expect(buildKnowledgeExcerpt(text, ['zzz'], 100)).toBe(`${'a'.repeat(100)}…`);
  });
});
