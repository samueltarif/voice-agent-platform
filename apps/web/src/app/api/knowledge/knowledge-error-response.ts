import { NextResponse } from 'next/server';

interface KnowledgeApiErrorDetails {
  readonly code?: string;
  readonly message?: string;
}

interface KnowledgeApiError extends Error {
  readonly status?: number;
  readonly data?: {
    readonly error?: KnowledgeApiErrorDetails;
  };
}

const SAFE_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: 'Dados do documento inválidos.',
  FORBIDDEN: 'Permissão insuficiente para esta operação.',
  NOT_FOUND: 'Documento não encontrado.',
  CONFLICT: 'Documento em conflito com o conteúdo existente.',
  INVALID_STATE_TRANSITION: 'Transição de estado inválida para o documento.',
};

function resolveStatus(status: unknown): number {
  if (typeof status === 'number' && status >= 400 && status < 600) return status;
  return 500;
}

function resolveCode(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const code = (data as { readonly error?: { readonly code?: string } }).error?.code;
    if (code) return code;
  }
  return 'API_ERROR';
}

function resolveMessage(data: unknown, code: string, fallback: string): string {
  const safe = SAFE_MESSAGES[code];
  if (safe) return safe;
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { readonly error?: { readonly message?: string } }).error?.message;
    if (message && !/select|insert|params|constraint|duplicate key/i.test(message)) return message;
  }
  return fallback;
}

export function mapKnowledgeBffError(error: unknown, fallback: string): NextResponse {
  const err = error as KnowledgeApiError;
  const status = resolveStatus(err?.status);
  const code = resolveCode(err?.data);
  if (status === 500) {
    return NextResponse.json({ error: fallback, code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
  const message = resolveMessage(err?.data, code, fallback);
  return NextResponse.json({ error: message, code }, { status });
}
