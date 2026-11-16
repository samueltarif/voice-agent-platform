import { describe, it, expect } from 'vitest';
import {
  buildKnowledgeEdit,
  initialKnowledgeEditValues,
  validateKnowledgeEdit,
} from './validate-knowledge-edit';
import { KNOWLEDGE_TEST_DOC } from './knowledge-test-fixtures';

const doc = {
  ...KNOWLEDGE_TEST_DOC,
  source: { ...KNOWLEDGE_TEST_DOC.source, sourceVersion: 'v1' },
};
const initial = initialKnowledgeEditValues(doc);

describe('validateKnowledgeEdit', () => {
  it('accepts the unchanged document', () => {
    expect(validateKnowledgeEdit(initial)).toEqual({});
  });

  it('reports each invalid field with a message in Portuguese', () => {
    const errors = validateKnowledgeEdit({
      title: '   ',
      collection: 'c'.repeat(101),
      sourceVersion: 'v'.repeat(101),
      replaceContent: true,
      rawText: '  ',
    });
    expect(errors).toEqual({
      title: 'Informe o título.',
      collection: 'Use no máximo 100 caracteres.',
      sourceVersion: 'Use no máximo 100 caracteres.',
      rawText: 'Cole o novo conteúdo ou desmarque a substituição.',
    });
    expect(validateKnowledgeEdit({ ...initial, title: 't'.repeat(201) }).title).toBe(
      'Use no máximo 200 caracteres.',
    );
  });
});

describe('buildKnowledgeEdit', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildKnowledgeEdit(doc, initial)).toEqual({});
  });

  it('sends only changed fields, trimming and clearing empties with null', () => {
    const edit = buildKnowledgeEdit(doc, {
      ...initial,
      title: '  Novo título ',
      collection: ' ',
      sourceVersion: '',
    });
    expect(edit).toEqual({ title: 'Novo título', collection: null, sourceVersion: null });
  });

  it('includes new content only when replacement is enabled', () => {
    expect(buildKnowledgeEdit(doc, { ...initial, rawText: 'texto' })).toEqual({});
    expect(buildKnowledgeEdit(doc, { ...initial, replaceContent: true, rawText: 'texto' })).toEqual(
      {
        rawText: 'texto',
      },
    );
  });
});
