import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeExtractionHttpBody,
  type KnowledgeExtractionResponse,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { decodeUploadBase64 } from './decode-upload-base64.js';
import { classifyUpload, type ClassifiedUpload } from './classify-upload.js';
import { ExtractionProcessRunner } from './run-extraction-in-child-process.js';
import type { ExtractionSuccess } from './extraction-job.js';

type Warning = KnowledgeExtractionResponse['warnings'][number];

/** Quebras uniformes, sem linhas em branco em excesso e sem bordas vazias. */
function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function warningsFor(upload: ClassifiedUpload, result: ExtractionSuccess): Warning[] {
  if (upload.format === 'DOCX') return ['DOCX_MAIN_BODY_ONLY'];
  if (upload.format !== 'PDF') return [];
  const partial: Warning[] = result.pdf?.pagesWithoutText ? ['PDF_PAGES_WITHOUT_TEXT'] : [];
  return [...partial, 'PDF_TEXT_ORDER_APPROXIMATE'];
}

function buildResponse(
  upload: ClassifiedUpload,
  bytes: number,
  result: ExtractionSuccess & { text: string },
): KnowledgeExtractionResponse {
  const { text, pdf } = result;
  return {
    format: upload.format,
    fileName: upload.fileName,
    suggestedTitle: upload.baseName.slice(0, 200),
    suggestedLocator: `arquivo:${upload.fileName}`,
    text,
    stats: { bytes, chars: text.length, lines: text.split('\n').length, ...(pdf ?? {}) },
    warnings: warningsFor(upload, result),
  };
}

export interface KnowledgeUploadExtractor {
  extract(
    body: KnowledgeExtractionHttpBody,
    signal?: AbortSignal,
  ): Promise<KnowledgeExtractionResponse>;
}

/**
 * Extração SOMENTE LEITURA (D-A6): base64 estrito → nome/extensão/tamanho/
 * assinatura (e envelope PDF) → processo filho → texto normalizado. Nada é
 * gravado; a persistência só acontece quando o usuário confirma.
 */
export function createKnowledgeUploadExtractor(
  runner: ExtractionProcessRunner = new ExtractionProcessRunner(),
): KnowledgeUploadExtractor {
  return {
    async extract(body, signal) {
      const bytes = decodeUploadBase64(body.contentBase64);
      const upload = classifyUpload({ fileName: body.fileName, bytes });
      const result = await runner.run({ format: upload.format, bytes, signal });
      const text = normalizeExtractedText(result.text);
      if (!text) throw new KnowledgeExtractionError(CODES.NO_TEXT);
      if (text.length > KNOWLEDGE_UPLOAD_LIMITS.maxTextChars) {
        throw new KnowledgeExtractionError(CODES.TEXT_TOO_LONG);
      }
      return buildResponse(upload, bytes.length, { ...result, text });
    },
  };
}
