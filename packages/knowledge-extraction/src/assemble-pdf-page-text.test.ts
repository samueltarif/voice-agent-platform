import { describe, expect, it } from 'vitest';
import { assemblePdfPageText, visibleChars } from './assemble-pdf-page-text.js';

const item = (str: string, y: number, hasEOL = false) => ({
  str,
  hasEOL,
  transform: [1, 0, 0, 1, 0, y],
});

describe('assemblePdfPageText', () => {
  it('breaks on hasEOL and on a new baseline, keeping items of the same line together', () => {
    const text = assemblePdfPageText([
      item('Transmissor ', 700),
      item('QT-310', 700, true),
      item('Faixa', 680),
      { type: 'beginMarkedContent' },
      item('Página 2', 660),
    ]);
    expect(text).toBe('Transmissor QT-310\nFaixa\nPágina 2');
  });

  it('counts only visible characters', () => {
    expect(visibleChars(' a \n\t b ')).toBe(2);
  });
});
