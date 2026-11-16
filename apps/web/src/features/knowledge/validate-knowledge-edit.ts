import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import type { KnowledgeDocumentEdit } from '../../lib/knowledge/knowledge-document-management-client';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';

export interface KnowledgeEditValues {
  readonly title: string;
  readonly collection: string;
  readonly sourceVersion: string;
  readonly replaceContent: boolean;
  readonly rawText: string;
}

export type KnowledgeEditErrors = Partial<Record<keyof KnowledgeEditValues, string>>;

export function initialKnowledgeEditValues(doc: KnowledgeDocumentResponse): KnowledgeEditValues {
  return {
    title: doc.title,
    collection: doc.collection ?? '',
    sourceVersion: doc.source.sourceVersion ?? '',
    replaceContent: false,
    rawText: '',
  };
}

const MAX_SOURCE_VERSION = 100;

export function validateKnowledgeEdit(values: KnowledgeEditValues): KnowledgeEditErrors {
  const errors: KnowledgeEditErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Informe o título.';
  else if (title.length > KNOWLEDGE_LIMITS.title) {
    errors.title = `Use no máximo ${KNOWLEDGE_LIMITS.title} caracteres.`;
  }
  if (values.collection.trim().length > KNOWLEDGE_LIMITS.collection) {
    errors.collection = `Use no máximo ${KNOWLEDGE_LIMITS.collection} caracteres.`;
  }
  if (values.sourceVersion.trim().length > MAX_SOURCE_VERSION) {
    errors.sourceVersion = `Use no máximo ${MAX_SOURCE_VERSION} caracteres.`;
  }
  if (values.replaceContent && !values.rawText.trim()) {
    errors.rawText = 'Cole o novo conteúdo ou desmarque a substituição.';
  } else if (values.rawText.length > KNOWLEDGE_LIMITS.rawText) {
    errors.rawText = `O conteúdo excede ${KNOWLEDGE_LIMITS.rawText.toLocaleString('pt-BR')} caracteres.`;
  }
  return errors;
}

/** Texto aparado; vazio vira `null` (remove o valor). */
function optional(value: string): string | null {
  return value.trim() || null;
}

/** Envia somente o que mudou; texto vazio em coleção/versão remove o valor. */
export function buildKnowledgeEdit(
  doc: KnowledgeDocumentResponse,
  values: KnowledgeEditValues,
): KnowledgeDocumentEdit {
  const next = {
    title: values.title.trim(),
    collection: optional(values.collection),
    sourceVersion: optional(values.sourceVersion),
  };
  const previous = {
    title: doc.title,
    collection: doc.collection ?? null,
    sourceVersion: doc.source.sourceVersion ?? null,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
    (key) => next[key] !== previous[key],
  );
  const edit: Record<string, string | null> = {};
  for (const key of changed) edit[key] = next[key];
  if (values.replaceContent && values.rawText.trim()) edit.rawText = values.rawText;
  return edit as KnowledgeDocumentEdit;
}
