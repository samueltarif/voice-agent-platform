import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeExtractionHttpBody,
  type KnowledgeExtractionResponse,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { decodeUploadBase64 } from './decode-upload-base64.js';
import { classifyUpload, type ClassifiedUpload } from './classify-upload.js';
import { ExtractionWorkerRunner } from './run-extraction-in-worker.js';

/** Quebras uniformes, sem linhas em branco em excesso e sem bordas vazias. */
function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildResponse(
  upload: ClassifiedUpload,
  bytes: number,
  text: string,
): KnowledgeExtractionResponse {
  return {
    format: upload.format,
    fileName: upload.fileName,
    suggestedTitle: upload.baseName.slice(0, 200),
    suggestedLocator: `arquivo:${upload.fileName}`,
    text,
    stats: { bytes, chars: text.length, lines: text.split('\n').length },
    warnings: upload.format === 'DOCX' ? ['DOCX_MAIN_BODY_ONLY'] : [],
  };
}

export interface KnowledgeUploadExtractor {
  extract(body: KnowledgeExtractionHttpBody): Promise<KnowledgeExtractionResponse>;
}

/**
 * Extração SOMENTE LEITURA (D-A6): base64 estrito → nome/extensão/tamanho/
 * assinatura → worker → texto normalizado. Nada é gravado; a persistência só
 * acontece depois, quando o usuário confirma pela ingestão existente.
 */
export function createKnowledgeUploadExtractor(
  runner: ExtractionWorkerRunner = new ExtractionWorkerRunner(),
): KnowledgeUploadExtractor {
  return {
    async extract(body) {
      const bytes = decodeUploadBase64(body.contentBase64);
      const upload = classifyUpload({ fileName: body.fileName, bytes });
      const text = normalizeExtractedText(await runner.run(upload.format, bytes));
      if (!text) throw new KnowledgeExtractionError(CODES.NO_TEXT);
      if (text.length > KNOWLEDGE_UPLOAD_LIMITS.maxTextChars) {
        throw new KnowledgeExtractionError(CODES.TEXT_TOO_LONG);
      }
      return buildResponse(upload, bytes.length, text);
    },
  };
}
