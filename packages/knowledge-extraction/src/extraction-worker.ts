import { parentPort, workerData } from 'node:worker_threads';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  type KnowledgeUploadFormat,
} from '@voice-agent/contracts';
import { installWorkerNetworkGuard } from './worker-network-guard.js';
import { KnowledgeExtractionError } from './extraction-error.js';
import { extractPlainText } from './extract-plain-text.js';
import { extractDocxText } from './extract-docx-text.js';

/** Mensagem do worker: texto extraído OU código de recusa (nunca conteúdo no erro). */
export type ExtractionWorkerReply =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly code: string };

installWorkerNetworkGuard();

const { format, bytes } = workerData as { format: KnowledgeUploadFormat; bytes: Uint8Array };

function extract(): ExtractionWorkerReply {
  try {
    const text = format === 'DOCX' ? extractDocxText(bytes) : extractPlainText(bytes);
    return { ok: true, text };
  } catch (error) {
    const code = error instanceof KnowledgeExtractionError ? error.code : CODES.MALFORMED_FILE;
    return { ok: false, code };
  }
}

parentPort?.postMessage(extract());
