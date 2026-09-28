import { NextResponse } from 'next/server';

interface ApiErrorDetails {
  readonly code?: string;
  readonly message?: string;
  readonly requestId?: string;
}

interface ApiErrorWithDetails extends Error {
  readonly status?: number;
  readonly data?: {
    readonly error?: ApiErrorDetails;
  };
}

const DRAFT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CONFLICT: 'Já existe um rascunho ativo para este agente.',
  INVALID_STATE: 'Não é possível alterar rascunho de um agente inativo.',
  NOT_FOUND: 'Agente ou versão do rascunho não encontrada.',
  FORBIDDEN: 'Permissão insuficiente para gerenciar rascunhos deste agente.',
};

function resolveHttpStatus(status: unknown): number {
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return status;
  }
  return 500;
}

function resolveErrorCode(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const errorObj = (data as { readonly error?: { readonly code?: string } }).error;
    if (errorObj?.code) return errorObj.code;
  }
  return 'API_ERROR';
}

function resolveErrorMessage(data: unknown, code: string): string {
  const customMessage = DRAFT_ERROR_MESSAGES[code];
  if (customMessage) return customMessage;

  if (data && typeof data === 'object' && 'error' in data) {
    const errorObj = (data as { readonly error?: { readonly message?: string } }).error;
    if (errorObj?.message) return errorObj.message;
  }
  return 'Falha ao processar operação no rascunho.';
}

export function mapDraftApiError(error: unknown): NextResponse {
  const err = error as ApiErrorWithDetails;
  const status = resolveHttpStatus(err?.status);
  const code = resolveErrorCode(err?.data);
  const message = resolveErrorMessage(err?.data, code);

  return NextResponse.json({ error: message, code }, { status });
}
