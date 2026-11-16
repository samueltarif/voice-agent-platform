import { z } from 'zod';

/**
 * PR A1 (DEC-065): envio de arquivo para a Base de Conhecimento em duas etapas.
 * 1) EXTRAÇÃO: o servidor valida o arquivo e devolve só o texto (nada é gravado);
 * 2) CONFIRMAÇÃO: o usuário confirma e a ingestão existente recebe o texto.
 * Sem PDF nesta etapa (A2).
 */
export const KNOWLEDGE_UPLOAD_FORMATS = ['TXT', 'MARKDOWN', 'DOCX'] as const;
export type KnowledgeUploadFormat = (typeof KNOWLEDGE_UPLOAD_FORMATS)[number];

/** Extensões aceitas (minúsculas) e o formato esperado do conteúdo. */
export const KNOWLEDGE_UPLOAD_EXTENSIONS: Readonly<Record<string, KnowledgeUploadFormat>> = {
  '.txt': 'TXT',
  '.md': 'MARKDOWN',
  '.markdown': 'MARKDOWN',
  '.docx': 'DOCX',
};

const MiB = 1024 * 1024;

export const KNOWLEDGE_UPLOAD_LIMITS = {
  /** Bytes reais do arquivo, por formato (verificados após decodificar). */
  maxFileBytes: { TXT: 2 * MiB, MARKDOWN: 2 * MiB, DOCX: 10 * MiB },
  /** Base64 de 10 MiB ≈ 13,4 MiB; teto de 15 MiB codificados (D-A3). */
  maxEncodedChars: 15 * MiB,
  /** Corpo HTTP (BFF e API): base64 + JSON + margem. */
  maxRequestBodyBytes: 15 * MiB + 64 * 1024,
  /** Mesmo teto do texto na ingestão (`rawText`). */
  maxTextChars: 200_000,
  maxFileNameChars: 255,
  docx: {
    maxEntries: 1000,
    maxTotalUncompressedBytes: 50 * MiB,
    maxEntryUncompressedBytes: 20 * MiB,
    maxCompressionRatio: 100,
  },
  worker: { timeoutMs: 15_000, maxOldGenerationSizeMb: 256, maxConcurrent: 2 },
} as const;

/** Códigos de recusa; a mensagem exibida é montada no cliente (sem detalhes internos). */
export const KNOWLEDGE_UPLOAD_ERROR_CODES = {
  INVALID_FILE_NAME: 'KNOWLEDGE_UPLOAD_INVALID_FILE_NAME',
  INVALID_ENCODING: 'KNOWLEDGE_UPLOAD_INVALID_BASE64',
  TOO_LARGE: 'KNOWLEDGE_UPLOAD_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'KNOWLEDGE_UPLOAD_UNSUPPORTED_FORMAT',
  PDF_NOT_YET_SUPPORTED: 'KNOWLEDGE_UPLOAD_PDF_NOT_YET_SUPPORTED',
  LEGACY_DOC: 'KNOWLEDGE_UPLOAD_LEGACY_DOC',
  FORMAT_MISMATCH: 'KNOWLEDGE_UPLOAD_FORMAT_MISMATCH',
  INVALID_TEXT_ENCODING: 'KNOWLEDGE_UPLOAD_INVALID_TEXT_ENCODING',
  BINARY_CONTENT: 'KNOWLEDGE_UPLOAD_BINARY_CONTENT',
  MALFORMED_FILE: 'KNOWLEDGE_UPLOAD_MALFORMED_FILE',
  MACRO_ENABLED: 'KNOWLEDGE_UPLOAD_MACRO_ENABLED',
  UNSAFE_XML: 'KNOWLEDGE_UPLOAD_UNSAFE_XML',
  ARCHIVE_LIMIT_EXCEEDED: 'KNOWLEDGE_UPLOAD_ARCHIVE_LIMIT_EXCEEDED',
  NO_TEXT: 'KNOWLEDGE_UPLOAD_NO_TEXT',
  TEXT_TOO_LONG: 'KNOWLEDGE_UPLOAD_TEXT_TOO_LONG',
  TIMEOUT: 'KNOWLEDGE_UPLOAD_EXTRACTION_TIMEOUT',
  RESOURCE_LIMIT: 'KNOWLEDGE_UPLOAD_RESOURCE_LIMIT',
  BUSY: 'KNOWLEDGE_UPLOAD_BUSY',
} as const;

export type KnowledgeUploadErrorCode =
  (typeof KNOWLEDGE_UPLOAD_ERROR_CODES)[keyof typeof KNOWLEDGE_UPLOAD_ERROR_CODES];

export const knowledgeExtractionHttpBodySchema = z
  .object({
    fileName: z.string().min(1).max(KNOWLEDGE_UPLOAD_LIMITS.maxFileNameChars),
    contentBase64: z.string().min(1).max(KNOWLEDGE_UPLOAD_LIMITS.maxEncodedChars),
  })
  .strict();

export type KnowledgeExtractionHttpBody = z.infer<typeof knowledgeExtractionHttpBodySchema>;

export const KNOWLEDGE_UPLOAD_WARNINGS = ['DOCX_MAIN_BODY_ONLY'] as const;

export const knowledgeExtractionResponseSchema = z
  .object({
    format: z.enum(KNOWLEDGE_UPLOAD_FORMATS),
    fileName: z.string().min(1).max(KNOWLEDGE_UPLOAD_LIMITS.maxFileNameChars),
    suggestedTitle: z.string().min(1).max(200),
    suggestedLocator: z.string().min(1).max(1000),
    text: z.string().min(1).max(KNOWLEDGE_UPLOAD_LIMITS.maxTextChars),
    stats: z
      .object({
        bytes: z.number().int().positive(),
        chars: z.number().int().positive(),
        lines: z.number().int().positive(),
      })
      .strict(),
    warnings: z.array(z.enum(KNOWLEDGE_UPLOAD_WARNINGS)).max(5),
  })
  .strict();

export type KnowledgeExtractionResponse = z.infer<typeof knowledgeExtractionResponseSchema>;
