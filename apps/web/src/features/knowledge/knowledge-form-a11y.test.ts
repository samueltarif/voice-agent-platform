import { describe, it, expect, vi } from 'vitest';
import { createIngestFieldBindings } from './ingest-field-bindings';
import { firstInvalidField, focusFirstInvalidField } from './focus-first-invalid-field';
import type { KnowledgeFormValues } from './validate-knowledge-form';

const VALUES: KnowledgeFormValues = {
  title: '',
  sourceType: '',
  locator: '',
  rawText: '',
  collection: '',
};

function bindings(errors: Record<string, string> = {}) {
  return createIngestFieldBindings({
    values: VALUES,
    errors,
    submitting: false,
    setValues: () => {},
  });
}

describe('ingest field accessibility (F-A4)', () => {
  it('marks required fields with aria-required and leaves optional ones unmarked', () => {
    const { fieldA11y } = bindings();
    for (const f of ['title', 'sourceType', 'locator', 'rawText'] as const) {
      expect(fieldA11y(f)['aria-required']).toBe(true);
    }
    expect(fieldA11y('collection')['aria-required']).toBeUndefined();
  });

  it('describes hinted fields by their hint, and by the error once invalid', () => {
    expect(bindings().fieldA11y('locator')['aria-describedby']).toBe('kb-locator-hint');
    expect(bindings().fieldA11y('collection')['aria-describedby']).toBe('kb-collection-hint');
    expect(bindings().fieldA11y('title')['aria-describedby']).toBeUndefined();
    const withError = bindings({ locator: 'Informe o identificador da origem.' }).fieldA11y(
      'locator',
    );
    expect(withError['aria-describedby']).toBe('kb-locator-error');
    expect(withError['aria-invalid']).toBe(true);
  });
});

describe('focus on first invalid field (F-A4)', () => {
  it('follows the visual order of the form', () => {
    expect(firstInvalidField({ rawText: 'x', locator: 'x', collection: 'x' })).toBe('collection');
    expect(firstInvalidField({ rawText: 'x', title: 'x' })).toBe('title');
    expect(firstInvalidField({})).toBeUndefined();
  });

  it('focuses the element of the first invalid field and nothing when valid', () => {
    const focus = vi.fn();
    const getElement = vi.fn(() => ({ focus }));
    expect(focusFirstInvalidField({ locator: 'x', rawText: 'x' }, getElement)).toBe(true);
    expect(getElement).toHaveBeenCalledWith('kb-locator');
    expect(focus).toHaveBeenCalledTimes(1);
    getElement.mockClear();
    expect(focusFirstInvalidField({}, getElement)).toBe(false);
    expect(getElement).not.toHaveBeenCalled();
  });
});
