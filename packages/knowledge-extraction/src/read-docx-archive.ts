import { unzipSync, type UnzipFileInfo } from 'fflate';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

const LIMITS = KNOWLEDGE_UPLOAD_LIMITS.docx;
const CONTENT_TYPES = '[Content_Types].xml';
const MAIN_DOCUMENT = 'word/document.xml';
const WANTED = new Set([CONTENT_TYPES, MAIN_DOCUMENT]);

export interface DocxParts {
  readonly contentTypes: string;
  readonly document: string;
}

interface ScanState {
  entries: number;
  declaredTotal: number;
}

/**
 * Inspeciona cada entrada pelo diretório central ANTES de descompactar: limite
 * de entradas, tamanho total e por entrada, razão de compressão e presença de
 * macros. Só as duas partes necessárias são descompactadas; o fflate nunca
 * produz mais bytes que o tamanho declarado (verificado contra truncamento).
 */
function inspectEntry(file: UnzipFileInfo, state: ScanState): boolean {
  state.entries += 1;
  state.declaredTotal += file.originalSize;
  if (state.entries > LIMITS.maxEntries || state.declaredTotal > LIMITS.maxTotalUncompressedBytes) {
    throw new KnowledgeExtractionError(CODES.ARCHIVE_LIMIT_EXCEEDED);
  }
  if (/vbaProject\.bin$/i.test(file.name) || /vbaData\.xml$/i.test(file.name)) {
    throw new KnowledgeExtractionError(CODES.MACRO_ENABLED);
  }
  if (!WANTED.has(file.name)) return false;
  if (file.originalSize > LIMITS.maxEntryUncompressedBytes) {
    throw new KnowledgeExtractionError(CODES.ARCHIVE_LIMIT_EXCEEDED);
  }
  if (file.originalSize > Math.max(file.size, 1) * LIMITS.maxCompressionRatio) {
    throw new KnowledgeExtractionError(CODES.ARCHIVE_LIMIT_EXCEEDED);
  }
  return true;
}

function decodeUtf8(bytes: Uint8Array | undefined): string {
  if (!bytes) throw new KnowledgeExtractionError(CODES.MALFORMED_FILE);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new KnowledgeExtractionError(CODES.MALFORMED_FILE);
  }
}

export function readDocxArchive(bytes: Uint8Array): DocxParts {
  const state: ScanState = { entries: 0, declaredTotal: 0 };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => inspectEntry(file, state) });
  } catch (error) {
    if (error instanceof KnowledgeExtractionError) throw error;
    throw new KnowledgeExtractionError(CODES.MALFORMED_FILE);
  }
  return {
    contentTypes: decodeUtf8(files[CONTENT_TYPES]),
    document: decodeUtf8(files[MAIN_DOCUMENT]),
  };
}
