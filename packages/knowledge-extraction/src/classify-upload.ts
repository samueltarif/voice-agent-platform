import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_EXTENSIONS,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeUploadFormat,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

export interface ClassifiedUpload {
  readonly fileName: string;
  readonly baseName: string;
  readonly format: KnowledgeUploadFormat;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((value, i) => bytes[i] === value);

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// eslint-disable-next-line no-control-regex -- detectar caracteres de controle é o objetivo
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Só o nome-base, sem caminho; vazio, longo demais ou com controle ⇒ recusa. */
function baseFileName(raw: string): string {
  const fileName = raw.split(/[\\/]/).pop()?.trim() ?? '';
  const invalid = !fileName || fileName.length > 255 || CONTROL_CHARS.test(fileName);
  if (invalid) throw new KnowledgeExtractionError(CODES.INVALID_FILE_NAME);
  return fileName;
}

function sanitizeFileName(raw: string): { fileName: string; baseName: string; ext: string } {
  const fileName = baseFileName(raw);
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  const baseName = (dot >= 0 ? fileName.slice(0, dot) : fileName).trim();
  if (!baseName) throw new KnowledgeExtractionError(CODES.INVALID_FILE_NAME);
  return { fileName, baseName, ext };
}

function formatFromExtension(ext: string): KnowledgeUploadFormat {
  if (ext === '.pdf') throw new KnowledgeExtractionError(CODES.PDF_NOT_YET_SUPPORTED);
  if (ext === '.doc') throw new KnowledgeExtractionError(CODES.LEGACY_DOC);
  const format = KNOWLEDGE_UPLOAD_EXTENSIONS[ext];
  if (!format) throw new KnowledgeExtractionError(CODES.UNSUPPORTED_FORMAT);
  return format;
}

/** A extensão define o formato esperado; a assinatura dos bytes precisa concordar. */
function assertSignatureMatches(format: KnowledgeUploadFormat, bytes: Uint8Array): void {
  if (startsWith(bytes, OLE_SIGNATURE)) throw new KnowledgeExtractionError(CODES.LEGACY_DOC);
  const zip = startsWith(bytes, ZIP_SIGNATURE);
  if (format === 'DOCX' && !zip) throw new KnowledgeExtractionError(CODES.FORMAT_MISMATCH);
  if (format !== 'DOCX' && (zip || startsWith(bytes, PDF_SIGNATURE))) {
    throw new KnowledgeExtractionError(CODES.FORMAT_MISMATCH);
  }
}

/**
 * Validação ANTES da extração (no processo da API): nome, extensão aceita,
 * tamanho real em bytes por formato e assinatura compatível.
 */
export function classifyUpload(input: { fileName: string; bytes: Uint8Array }): ClassifiedUpload {
  const { fileName, baseName, ext } = sanitizeFileName(input.fileName);
  const format = formatFromExtension(ext);
  if (input.bytes.length > KNOWLEDGE_UPLOAD_LIMITS.maxFileBytes[format]) {
    throw new KnowledgeExtractionError(CODES.TOO_LARGE);
  }
  assertSignatureMatches(format, input.bytes);
  return { fileName, baseName, format };
}
