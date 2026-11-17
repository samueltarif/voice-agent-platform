import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_EXTENSIONS,
  KNOWLEDGE_UPLOAD_LIMITS,
  knowledgeExtractionResponseSchema,
  type KnowledgeExtractionResponse,
} from '@voice-agent/contracts';
import { knowledgeOrgHeaders } from './knowledge-org-header';
import { normalizeKnowledgeBffError, type KnowledgeBffError } from './knowledge-documents-client';
import { KNOWLEDGE_UPLOAD_MESSAGES } from './knowledge-upload-messages';

/** Mesmas extensões aceitas pelo servidor (a validação definitiva é sempre lá). */
export const KNOWLEDGE_UPLOAD_ACCEPT = Object.keys(KNOWLEDGE_UPLOAD_EXTENSIONS).join(',');

function refusal(code: string): KnowledgeBffError {
  return { status: 422, code, message: KNOWLEDGE_UPLOAD_MESSAGES[code] ?? 'Arquivo recusado.' };
}

/** Pré-checagem só de UX: evita enviar o que o servidor certamente recusará. */
export function precheckKnowledgeFile(file: File): KnowledgeBffError | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (ext === '.doc') return refusal(CODES.LEGACY_DOC);
  const format = KNOWLEDGE_UPLOAD_EXTENSIONS[ext];
  if (!format) return refusal(CODES.UNSUPPORTED_FORMAT);
  if (file.size === 0) return refusal(CODES.NO_TEXT);
  if (file.size > KNOWLEDGE_UPLOAD_LIMITS.maxFileBytes[format]) return refusal(CODES.TOO_LARGE);
  return null;
}

/** Base64 padrão (com padding) em blocos, sem estourar a pilha com arquivos grandes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Envia o arquivo para EXTRAÇÃO (somente leitura; nada é gravado) e valida a
 * resposta pelo contrato antes de exibi-la.
 */
export async function extractKnowledgeFile(
  orgSlug: string,
  file: File,
): Promise<KnowledgeExtractionResponse> {
  const blocked = precheckKnowledgeFile(file);
  if (blocked) throw blocked;
  const contentBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const res = await fetch('/api/knowledge/extractions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...knowledgeOrgHeaders(orgSlug) },
    body: JSON.stringify({ fileName: file.name, contentBase64 }),
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) throw normalizeKnowledgeBffError(res.status, payload);
  const parsed = knowledgeExtractionResponseSchema.safeParse(
    (payload as { extraction?: unknown } | null)?.extraction,
  );
  if (!parsed.success) throw { status: 502, code: 'API_ERROR', message: 'Resposta inválida.' };
  return parsed.data;
}
