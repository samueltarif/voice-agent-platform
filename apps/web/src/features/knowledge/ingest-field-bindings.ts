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

export function createIngestFieldBindings(input: CreateBindingsInput): IngestFieldBindings {
  const { values, errors, submitting, setValues } = input;
  const onFieldChange =
    <K extends keyof KnowledgeFormValues>(field: K) =>
    (event: FieldEvent) =>
      setValues((previous) => ({ ...previous, [field]: event.target.value }));
  const fieldA11y = (field: keyof KnowledgeFormValues) => ({
    'aria-invalid': (errors[field] ? true : undefined) as true | undefined,
    'aria-describedby': errors[field] ? `kb-${field}-error` : undefined,
  });
  return { values, errors, submitting, onFieldChange, fieldA11y };
}
