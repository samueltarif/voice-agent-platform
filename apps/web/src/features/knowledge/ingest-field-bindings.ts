import * as React from 'react';
import type { KnowledgeFieldErrors, KnowledgeFormValues } from './validate-knowledge-form';

type FieldEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

export interface IngestFieldBindings {
  readonly values: KnowledgeFormValues;
  readonly errors: KnowledgeFieldErrors;
  readonly submitting: boolean;
  readonly onFieldChange: <K extends keyof KnowledgeFormValues>(
    field: K,
  ) => (event: FieldEvent) => void;
  readonly fieldA11y: (field: keyof KnowledgeFormValues) => {
    readonly 'aria-required'?: true | undefined;
    readonly 'aria-invalid'?: true | undefined;
    readonly 'aria-describedby'?: string | undefined;
  };
}

export interface CreateBindingsInput {
  readonly values: KnowledgeFormValues;
  readonly errors: KnowledgeFieldErrors;
  readonly submitting: boolean;
  readonly setValues: React.Dispatch<React.SetStateAction<KnowledgeFormValues>>;
}

const REQUIRED_FIELDS: ReadonlySet<keyof KnowledgeFormValues> = new Set([
  'title',
  'sourceType',
  'locator',
  'rawText',
]);
// Campos que exibem dica (o erro substitui a dica no DOM).
const HINT_FIELDS: ReadonlySet<keyof KnowledgeFormValues> = new Set(['collection', 'locator']);

function describedByOf(field: keyof KnowledgeFormValues, hasError: boolean): string | undefined {
  if (hasError) return `kb-${field}-error`;
  return HINT_FIELDS.has(field) ? `kb-${field}-hint` : undefined;
}

export function createIngestFieldBindings(input: CreateBindingsInput): IngestFieldBindings {
  const { values, errors, submitting, setValues } = input;
  const onFieldChange =
    <K extends keyof KnowledgeFormValues>(field: K) =>
    (event: FieldEvent) =>
      setValues((previous) => ({ ...previous, [field]: event.target.value }));
  const fieldA11y = (field: keyof KnowledgeFormValues) => ({
    'aria-required': (REQUIRED_FIELDS.has(field) ? true : undefined) as true | undefined,
    'aria-invalid': (errors[field] ? true : undefined) as true | undefined,
    'aria-describedby': describedByOf(field, Boolean(errors[field])),
  });
  return { values, errors, submitting, onFieldChange, fieldA11y };
}
