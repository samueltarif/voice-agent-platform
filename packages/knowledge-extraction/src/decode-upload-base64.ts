import { Buffer } from 'node:buffer';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Base64 ESTRITO (RFC 4648, alfabeto padrão, com padding, sem espaços): o texto
 * reconvertido precisa ser idêntico, o que recusa bits de preenchimento não
 * canônicos. Devolve os bytes reais, limitados ao maior arquivo aceito.
 */
export function decodeUploadBase64(encoded: string): Uint8Array {
  if (encoded.length === 0 || encoded.length > KNOWLEDGE_UPLOAD_LIMITS.maxEncodedChars) {
    throw new KnowledgeExtractionError(CODES.TOO_LARGE);
  }
  if (!STRICT_BASE64.test(encoded)) throw new KnowledgeExtractionError(CODES.INVALID_ENCODING);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) {
    throw new KnowledgeExtractionError(CODES.INVALID_ENCODING);
  }
  if (bytes.length === 0) throw new KnowledgeExtractionError(CODES.INVALID_ENCODING);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}
