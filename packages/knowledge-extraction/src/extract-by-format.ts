import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { extractPlainText } from './extract-plain-text.js';
import { extractDocxText } from './extract-docx-text.js';
import { extractPdfText } from './extract-pdf-text.js';
import type { ExtractionJobHeader, ExtractionReply, ExtractionSuccess } from './extraction-job.js';

async function extract(job: ExtractionJobHeader, bytes: Uint8Array): Promise<ExtractionSuccess> {
  if (job.format === 'PDF') return extractPdfText(bytes, job);
  if (job.format === 'DOCX') return { text: extractDocxText(bytes) };
  return { text: extractPlainText(bytes) };
}

/** Executado no processo filho: resultado OU código de recusa (nunca conteúdo no erro). */
export async function extractByFormat(
  job: ExtractionJobHeader,
  bytes: Uint8Array,
): Promise<ExtractionReply> {
  try {
    return { ok: true, ...(await extract(job, bytes)) };
  } catch (error) {
    const code = error instanceof KnowledgeExtractionError ? error.code : CODES.MALFORMED_FILE;
    return { ok: false, code };
  }
}
