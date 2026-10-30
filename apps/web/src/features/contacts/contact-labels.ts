import type { ContactImportRowRejection, ContactSuppressionReason } from '@voice-agent/contracts';

/** Rótulos descritivos; não expressam nenhuma regra legal (decisão do operador). */
export const SUPPRESSION_REASON_LABELS: Readonly<Record<ContactSuppressionReason, string>> = {
  OPT_OUT: 'Pediu para não ser contatado',
  DO_NOT_CALL_REGISTRY: 'Lista de bloqueio externa',
  MANUAL: 'Bloqueio manual',
};

export const SUPPRESSION_REASONS: readonly ContactSuppressionReason[] = [
  'OPT_OUT',
  'DO_NOT_CALL_REGISTRY',
  'MANUAL',
];

export const IMPORT_REJECTION_LABELS: Readonly<Record<ContactImportRowRejection, string>> = {
  EMPTY: 'Telefone vazio',
  INVALID_CHARACTERS: 'Caracteres inválidos no telefone',
  INVALID_E164: 'Formato internacional inválido',
  INVALID_AREA_CODE: 'DDD inválido',
  INVALID_SUBSCRIBER_NUMBER: 'Número de assinante inválido',
  NON_GEOGRAPHIC_NUMBER: 'Número não geográfico (0800, 0300…)',
  UNSUPPORTED_FORMAT: 'Formato não suportado',
  DUPLICATE_IN_FILE: 'Duplicado no arquivo',
  CELL_TOO_LONG: 'Célula longa demais',
  COLUMN_COUNT_MISMATCH: 'Quantidade de colunas diferente do cabeçalho',
};
