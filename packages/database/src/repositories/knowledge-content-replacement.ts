import {
  KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
  KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
  knowledgeChunkingPolicySchema,
  type KnowledgeChunkingPolicy,
} from '@voice-agent/contracts';
import type { KnowledgeDocumentEntity } from '../schema/knowledge.js';
import type { DatabaseExecutor } from './database-executor.js';
import { validateAndNormalizeKnowledgeText } from './knowledge-text-normalizer.js';
import { chunkKnowledgeText } from './knowledge-chunker.js';
import {
  deleteKnowledgeChunksByDocumentId,
  insertKnowledgeChunks,
} from './knowledge-chunk-repository.js';

function policyOf(row: KnowledgeDocumentEntity): KnowledgeChunkingPolicy {
  const hasPolicy =
    typeof row.chunkPolicyVersion === 'string' &&
    typeof row.chunkMaxChars === 'number' &&
    typeof row.chunkOverlapChars === 'number';
  return knowledgeChunkingPolicySchema.parse(
    hasPolicy
      ? {
          policyVersion: row.chunkPolicyVersion,
          maxChunkChars: row.chunkMaxChars,
          overlapChars: row.chunkOverlapChars,
        }
      : {
          policyVersion: 'v1',
          maxChunkChars: KNOWLEDGE_CHUNK_DEFAULT_MAX_CHARS,
          overlapChars: KNOWLEDGE_CHUNK_DEFAULT_OVERLAP_CHARS,
        },
  );
}

export interface ReplacedKnowledgeContent {
  readonly contentHash: string;
  readonly chunkCount: number;
  readonly policy: KnowledgeChunkingPolicy;
}

/**
 * Substitui TODOS os trechos do documento pelo novo texto, com a mesma política
 * de chunking usada na ingestão. Executa dentro da transação do chamador: ou o
 * documento fica inteiro com o conteúdo novo, ou nada muda.
 */
export async function replaceKnowledgeContent(
  tx: DatabaseExecutor,
  row: KnowledgeDocumentEntity,
  rawText: string,
): Promise<ReplacedKnowledgeContent> {
  const { normalizedText, contentHash } = validateAndNormalizeKnowledgeText(rawText);
  const policy = policyOf(row);
  const prepared = chunkKnowledgeText({ text: normalizedText, documentId: row.id, policy });
  await deleteKnowledgeChunksByDocumentId(tx, row.organizationId, row.id);
  const inserted = await insertKnowledgeChunks(
    tx,
    prepared.map((c) => ({
      organizationId: row.organizationId,
      documentId: row.id,
      ordinal: c.ordinal,
      text: c.text,
      policyVersion: c.policyVersion,
      contentIdentityValue: c.contentIdentityValue,
      chunkIdentity: c.chunkIdentity,
    })),
  );
  return { contentHash, chunkCount: inserted.length, policy };
}
