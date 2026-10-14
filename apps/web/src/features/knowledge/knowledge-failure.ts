import { kindFromStatus, type KnowledgeErrorKind } from './knowledge-error-state';

export const ORG_CONTEXT_MISMATCH_CODE = 'ORG_CONTEXT_MISMATCH';

export interface KnowledgeFailure {
  readonly status: number;
  readonly code?: string | undefined;
}

export function failureOf(error: unknown): KnowledgeFailure {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  return {
    status: typeof status === 'number' ? status : 0,
    ...(typeof code === 'string' ? { code } : {}),
  };
}

export type KnowledgeOperation = 'list' | 'ingest' | 'archive';

export function kindFromFailure(
  failure: KnowledgeFailure,
  operation: KnowledgeOperation = 'list',
): KnowledgeErrorKind {
  if (failure.code === ORG_CONTEXT_MISMATCH_CODE) return 'org-changed';
  if (operation === 'archive' && failure.status === 409) return 'archive-conflict';
  return kindFromStatus(failure.status);
}
