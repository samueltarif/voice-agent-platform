import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((value, i) => bytes[i] === value);

function decoderFor(bytes: Uint8Array): { encoding: string; skip: number } {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return { encoding: 'utf-8', skip: 3 };
  if (startsWith(bytes, [0xff, 0xfe])) return { encoding: 'utf-16le', skip: 2 };
  if (startsWith(bytes, [0xfe, 0xff])) return { encoding: 'utf-16be', skip: 2 };
  return { encoding: 'utf-8', skip: 0 };
}

/**
 * TXT e Markdown: UTF-8 estrito (ou UTF-16 com BOM). O Markdown é mantido como
 * texto (sem interpretar HTML ou links). Caractere NUL ⇒ conteúdo binário.
 */
export function extractPlainText(bytes: Uint8Array): string {
  const { encoding, skip } = decoderFor(bytes);
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(skip));
  } catch {
    throw new KnowledgeExtractionError(CODES.INVALID_TEXT_ENCODING);
  }
  if (text.includes('\u0000')) throw new KnowledgeExtractionError(CODES.BINARY_CONTENT);
  return text;
}
