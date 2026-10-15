import { KNOWLEDGE_SOURCE_TYPES, type KnowledgeSourceType } from '@voice-agent/contracts';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';

export interface KnowledgeFormValues {
  title: string;
  sourceType: KnowledgeSourceType | '' | (string & {});
  locator: string;
  rawText: string;
  collection: string;
}

export type KnowledgeFieldErrors = Partial<Record<keyof KnowledgeFormValues, string>>;

function titleError(title: string): string | undefined {
  const trimmed = title.trim();
  if (!trimmed) return 'Informe o título.';
  if (trimmed.length > KNOWLEDGE_LIMITS.title)
    return `Máximo de ${KNOWLEDGE_LIMITS.title} caracteres.`;
  return undefined;
}

function sourceTypeError(sourceType: KnowledgeFormValues['sourceType']): string | undefined {
  if (!sourceType || !(KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(sourceType))
    return 'Selecione o tipo de origem.';
  return undefined;
}

function locatorError(locator: string): string | undefined {
  const trimmed = locator.trim();
  if (!trimmed) return 'Informe o identificador da origem.';
  if (trimmed.length > KNOWLEDGE_LIMITS.locator)
    return `Máximo de ${KNOWLEDGE_LIMITS.locator} caracteres.`;
  return undefined;
}

function rawTextError(rawText: string): string | undefined {
  if (rawText.trim().length === 0) return 'Informe o conteúdo do documento.';
  if (rawText.length > KNOWLEDGE_LIMITS.rawText)
    return `Máximo de ${KNOWLEDGE_LIMITS.rawText.toLocaleString('pt-BR')} caracteres.`;
  return undefined;
}

function collectionError(collection: string): string | undefined {
  if (collection.trim().length > KNOWLEDGE_LIMITS.collection)
    return `Máximo de ${KNOWLEDGE_LIMITS.collection} caracteres.`;
  return undefined;
}

// Espelha ingestKnowledgeDocumentHttpBodySchema (title/locator/collection com trim; rawText sem trim, mas sem aceitar só espaços).
export function validateKnowledgeForm(v: KnowledgeFormValues): KnowledgeFieldErrors {
  const title = titleError(v.title);
  const sourceType = sourceTypeError(v.sourceType);
  const locator = locatorError(v.locator);
  const rawText = rawTextError(v.rawText);
  const collection = collectionError(v.collection);
  return {
    ...(title ? { title } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(locator ? { locator } : {}),
    ...(rawText ? { rawText } : {}),
    ...(collection ? { collection } : {}),
  };
}
