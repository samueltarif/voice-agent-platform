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
  // DEC-054 — gestão de documentos.
  KNOWLEDGE_STALE_UPDATE:
    'O documento foi alterado depois que a lista foi carregada. Atualize a lista e tente de novo.',
  KNOWLEDGE_NO_CHANGES: 'Nenhuma alteração para salvar.',
  KNOWLEDGE_NOT_EDITABLE: 'Este documento não pode ser alterado no estado atual.',
  KNOWLEDGE_PINNED_TO_AGENT_VERSION:
    'Documento fixado a uma versão publicada de agente: só pode ser arquivado. Cadastre um novo documento para mudar o conteúdo.',
  KNOWLEDGE_AGENT_UNAVAILABLE: 'Agente indisponível: escolha um agente ativo desta organização.',
  KNOWLEDGE_AGENT_NOT_PUBLISHED:
    'Este agente ainda não tem versão publicada. Publique-o no Agente IA para testar como ele consultará os documentos.',
  KNOWLEDGE_NOT_RESTORABLE: 'Este documento não pode ser restaurado.',
  KNOWLEDGE_DOCUMENT_IN_USE:
    'Documento ainda associado a um agente ou a uma versão publicada. Restaure, remova a associação e arquive de novo antes de excluir.',
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
