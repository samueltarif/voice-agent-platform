import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

const WINDOW = 1024;
const HEADER = /%PDF-(?:1\.[0-7]|2\.0)/;
/** Entrada `/Encrypt` (trailer ou dicionário do xref stream, nunca compactados). */
const ENCRYPT = /\/Encrypt(?![A-Za-z0-9])/;

const latin1 = (bytes: Uint8Array) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

/**
 * Verificação no processo da API, ANTES do processo filho: cabeçalho PDF no
 * 1º KiB, `%%EOF` no último KiB (arquivo truncado ⇒ recusa) e qualquer
 * dicionário de criptografia ⇒ recusa (inclusive só senha de proprietário).
 * Em caso de dúvida, recusa: um texto literal "/Encrypt" também é recusado.
 */
export function assertPdfEnvelope(bytes: Uint8Array): void {
  const text = latin1(bytes);
  if (!HEADER.test(text.slice(0, WINDOW)))
    throw new KnowledgeExtractionError(CODES.FORMAT_MISMATCH);
  if (!text.slice(-WINDOW).includes('%%EOF'))
    throw new KnowledgeExtractionError(CODES.MALFORMED_FILE);
  if (ENCRYPT.test(text)) throw new KnowledgeExtractionError(CODES.PDF_ENCRYPTED);
}
