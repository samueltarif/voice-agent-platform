/**
 * Mensagens SEGURAS (pt-BR) por código estável da API. Nenhuma mensagem bruta
 * da API, stack trace ou detalhe de banco chega à tela.
 */
export const OPERATION_MESSAGES: Readonly<Record<string, string>> = {
  AUDIENCE_REQUIRED: 'Defina a lista de contatos antes de iniciar a campanha.',
  NO_ELIGIBLE_CONTACTS: 'A lista não tem contatos elegíveis (todos suprimidos ou inválidos).',
  AGENT_NOT_ACTIVE: 'O agente desta campanha está arquivado.',
  AGENT_VERSION_NOT_PUBLISHED: 'O agente desta campanha não tem versão publicada.',
  INVALID_TRANSITION: 'Esta ação não é permitida no status atual da campanha.',
  NOT_DRAFT: 'A audiência só pode ser alterada enquanto a campanha é rascunho.',
  LIST_NOT_FOUND: 'Lista de contatos não encontrada.',
  NOT_FOUND: 'Registro não encontrado.',
  AUDIENCE_CHANGED_RETRY: 'A lista mudou durante a operação (nova supressão). Tente novamente.',
  NO_PUBLISHED_VERSION: 'Publique uma versão do agente antes de criar a campanha.',
  FORBIDDEN: 'Seu papel não permite esta operação.',
  CONFLICT: 'Já existe um registro com estes dados.',
  PAYLOAD_TOO_LARGE: 'O arquivo é grande demais (limite de 2 MB).',
  VALIDATION_ERROR: 'Dados inválidos. Revise o formulário.',
  BAD_REQUEST: 'Dados inválidos. Revise o arquivo ou o formulário.',
  ORG_CONTEXT_MISMATCH: 'A organização ativa mudou. Recarregue a página para continuar.',
};

export const GENERIC_OPERATION_MESSAGE = 'Não foi possível concluir a operação. Tente novamente.';

export function operationMessage(code: string | undefined): string {
  return (code && OPERATION_MESSAGES[code]) || GENERIC_OPERATION_MESSAGE;
}
