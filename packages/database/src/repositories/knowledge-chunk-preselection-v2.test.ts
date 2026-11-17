import { describe, expect, it } from 'vitest';
import { preselectChunksV2, V2_PASSAGE_CHUNK_LIMIT } from './knowledge-chunk-preselection-v2.js';
import { compileTerms } from './knowledge-term-matcher-v2.js';

const chunk = (documentId: string, ordinal: number, text: string) => ({
  id: `${documentId}-${ordinal}`,
  documentId,
  ordinal,
  text,
});

describe('preselectChunksV2 (DEC-067)', () => {
  it('drops SQL-superset rows without an exact match (QT-3100 for qt310)', () => {
    const rows = [chunk('a', 0, 'Transmissor QT-310.'), chunk('b', 0, 'Transmissor QT-3100.')];
    const out = preselectChunksV2(rows, compileTerms([], ['qt310']), 10);
    expect(out.rows.map((r) => r.documentId)).toEqual(['a']);
    expect(out.documentFrequency).toEqual([1]);
  });

  it('counts document frequency per term with exact matching', () => {
    const rows = [chunk('a', 0, 'válvula esfera'), chunk('a', 1, 'válvula gaveta')];
    const out = preselectChunksV2(rows, compileTerms(['valvula', 'esfera'], []), 10);
    expect(out.documentFrequency).toEqual([2, 1]);
  });

  it('keeps the best chunks first and caps the passage work', () => {
    const many = Array.from({ length: 80 }, (_, i) => chunk('d', i, 'cabo'));
    const best = chunk('z', 0, 'cabo blindado');
    const out = preselectChunksV2([...many, best], compileTerms(['cabo', 'blindado'], []), 81);
    expect(out.rows).toHaveLength(V2_PASSAGE_CHUNK_LIMIT);
    expect(out.rows[0]).toBe(best);
  });

  it('is deterministic on ties (document, then ordinal)', () => {
    const rows = [chunk('b', 1, 'cabo'), chunk('a', 2, 'cabo'), chunk('a', 1, 'cabo')];
    const out = preselectChunksV2(rows, compileTerms(['cabo'], []), 3);
    expect(out.rows.map((r) => r.id)).toEqual(['a-1', 'a-2', 'b-1']);
  });
});
