import type { KnowledgeUploadErrorCode } from '@voice-agent/contracts';

/**
 * Recusa de um arquivo enviado. Leva só o código do contrato: nenhuma mensagem
 * carrega conteúdo, nome do arquivo ou detalhe interno (DEC-065).
 */
export class KnowledgeExtractionError extends Error {
  constructor(readonly code: KnowledgeUploadErrorCode) {
    super(code);
    this.name = 'KnowledgeExtractionError';
  }
}
