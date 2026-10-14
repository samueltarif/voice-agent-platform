import type { KnowledgeFieldErrors, KnowledgeFormValues } from './validate-knowledge-form';

// Ordem visual do formulário.
const FIELD_ORDER: readonly (keyof KnowledgeFormValues)[] = [
  'title',
  'sourceType',
  'collection',
  'locator',
  'rawText',
];

export function firstInvalidField(
  errors: KnowledgeFieldErrors,
): keyof KnowledgeFormValues | undefined {
  return FIELD_ORDER.find((field) => Boolean(errors[field]));
}

/** Foca o 1º campo inválido; retorna true quando havia algum erro. */
export function focusFirstInvalidField(
  errors: KnowledgeFieldErrors,
  getElement: (id: string) => { focus: () => void } | null = (id) => document.getElementById(id),
): boolean {
  const field = firstInvalidField(errors);
  if (!field) return false;
  getElement(`kb-${field}`)?.focus();
  return true;
}
