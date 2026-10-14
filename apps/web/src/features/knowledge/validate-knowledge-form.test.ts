import { describe, it, expect } from 'vitest';
import { validateKnowledgeForm, type KnowledgeFormValues } from './validate-knowledge-form';

const VALID: KnowledgeFormValues = {
  title: 'Politica de trocas',
  sourceType: 'POLICY',
  locator: 'docs/trocas.md',
  rawText: 'Conteudo valido.',
  collection: 'suporte',
};

describe('validateKnowledgeForm (mirrors BFF contract)', () => {
  it('accepts a fully valid payload', () => {
    expect(validateKnowledgeForm(VALID)).toEqual({});
  });

  it('requires title, sourceType, locator and rawText', () => {
    const errors = validateKnowledgeForm({
      ...VALID,
      title: '  ',
      sourceType: '',
      locator: '',
      rawText: '',
    });
    expect(errors.title).toBeTruthy();
    expect(errors.sourceType).toBeTruthy();
    expect(errors.locator).toBeTruthy();
    expect(errors.rawText).toBeTruthy();
  });

  it('rejects unknown sourceType values', () => {
    const errors = validateKnowledgeForm({ ...VALID, sourceType: 'PDF_UPLOAD' });
    expect(errors.sourceType).toBeTruthy();
  });

  it('enforces the 200.000-character rawText limit', () => {
    expect(validateKnowledgeForm({ ...VALID, rawText: 'x'.repeat(200_000) })).toEqual({});
    const errors = validateKnowledgeForm({ ...VALID, rawText: 'x'.repeat(200_001) });
    expect(errors.rawText).toContain('200.000');
  });

  it('enforces title, locator and collection length caps', () => {
    const errors = validateKnowledgeForm({
      ...VALID,
      title: 't'.repeat(201),
      locator: 'l'.repeat(1001),
      collection: 'c'.repeat(101),
    });
    expect(errors.title).toContain('200');
    expect(errors.locator).toContain('1000');
    expect(errors.collection).toContain('100');
  });

  it('treats blank collection as absent (optional)', () => {
    expect(validateKnowledgeForm({ ...VALID, collection: '   ' })).toEqual({});
  });
});

describe('validateKnowledgeForm whitespace-only content (F-S6)', () => {
  it('rejects content made only of spaces, tabs and newlines', () => {
    expect(validateKnowledgeForm({ ...VALID, rawText: ' \n\t  ' }).rawText).toBe(
      'Informe o conteúdo do documento.',
    );
  });

  it('keeps accepting content with surrounding whitespace', () => {
    expect(validateKnowledgeForm({ ...VALID, rawText: '  texto  ' })).toEqual({});
  });
});
