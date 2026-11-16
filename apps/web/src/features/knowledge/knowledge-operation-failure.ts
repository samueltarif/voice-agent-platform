export interface KnowledgeOperationFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  /** Recarregar a lista resolve (versão desatualizada ou organização trocada). */
  readonly reloadHint: boolean;
}

const RELOAD_CODES = new Set(['KNOWLEDGE_STALE_UPDATE', 'ORG_CONTEXT_MISMATCH']);

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  0: 'Sem conexão com o servidor. Verifique a rede e tente de novo.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Seu papel nesta organização não permite esta operação.',
  404: 'Documento não encontrado. Ele pode ter sido excluído; atualize a lista.',
};

/**
 * Mensagem para o usuário. O BFF já devolve textos seguros em português para os
 * códigos conhecidos; aqui só se cobre falha de rede, sessão e permissão.
 */
export function describeKnowledgeFailure(error: unknown): KnowledgeOperationFailure {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : 0;
  const code = typeof e.code === 'string' ? e.code : 'API_ERROR';
  const serverMessage = typeof e.message === 'string' && status > 0 ? e.message : undefined;
  const message =
    STATUS_MESSAGES[status] ?? serverMessage ?? 'Não foi possível concluir a operação.';
  return { status, code, message, reloadHint: RELOAD_CODES.has(code) };
}
