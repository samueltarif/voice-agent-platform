import type { KnowledgeRetrievalHit, KnowledgeSourceType } from '@voice-agent/contracts';

// Engineering defaults only: envelope bounds are configurable per
// deployment and are NOT constitutional requirements.
export const VOICE_KNOWLEDGE_TRUST_CLASSIFICATION = 'UNTRUSTED_DATA' as const;
export const VOICE_KNOWLEDGE_MAX_EXCERPT_CHARS = 500;
export const VOICE_KNOWLEDGE_MAX_TOTAL_CHARS = 4000;

/**
 * A single retrieved excerpt. DATA only: it carries no authority over
 * tenant, tools, routing, pricing, policy, or call lifecycle.
 */
export interface VoiceKnowledgeExcerpt {
  readonly citationId: string;
  readonly documentId: string;
  readonly chunkId: string;
  readonly chunkOrdinal: number;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceLocator: string;
  readonly excerpt: string;
  readonly score: number;
}

/**
 * Bounded, deterministically ordered envelope of untrusted retrieved text.
 * Must be kept separate from authoritative system/developer policy and
 * tool instructions; formatting alone is not the protection boundary.
 */
export interface VoiceKnowledgeContextEnvelope {
  readonly trust: typeof VOICE_KNOWLEDGE_TRUST_CLASSIFICATION;
  readonly queryText: string;
  readonly excerpts: readonly VoiceKnowledgeExcerpt[];
  readonly truncated: boolean;
}

export function buildCitationId(documentId: string, chunkId: string, ordinal: number): string {
  return `${documentId}:${chunkId}:${ordinal}`;
}

function toExcerpt(hit: KnowledgeRetrievalHit): VoiceKnowledgeExcerpt {
  return {
    citationId: buildCitationId(hit.documentId, hit.chunkId, hit.citation.chunkOrdinal),
    documentId: hit.documentId,
    chunkId: hit.chunkId,
    chunkOrdinal: hit.citation.chunkOrdinal,
    sourceType: hit.citation.sourceType,
    sourceLocator: hit.citation.sourceLocator,
    excerpt: hit.textSnapshot.slice(0, VOICE_KNOWLEDGE_MAX_EXCERPT_CHARS),
    score: hit.score,
  };
}

function compareExcerpts(a: VoiceKnowledgeExcerpt, b: VoiceKnowledgeExcerpt): number {
  return (
    a.documentId.localeCompare(b.documentId) ||
    a.chunkOrdinal - b.chunkOrdinal ||
    a.chunkId.localeCompare(b.chunkId)
  );
}

/**
 * Builds the envelope with deterministic citation ordering and a bounded
 * total size. `upstreamTruncated` propagates the retrieval port's own
 * truncation flag so no truncation is ever silently dropped.
 */
export function buildVoiceKnowledgeEnvelope(
  hits: readonly KnowledgeRetrievalHit[],
  queryText: string,
  upstreamTruncated = false,
): VoiceKnowledgeContextEnvelope {
  const ordered = hits.map(toExcerpt).sort(compareExcerpts);

  const excerpts: VoiceKnowledgeExcerpt[] = [];
  let totalChars = 0;
  let truncated = upstreamTruncated;
  for (const excerpt of ordered) {
    if (totalChars + excerpt.excerpt.length > VOICE_KNOWLEDGE_MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    excerpts.push(excerpt);
    totalChars += excerpt.excerpt.length;
  }

  return {
    trust: VOICE_KNOWLEDGE_TRUST_CLASSIFICATION,
    queryText,
    excerpts,
    truncated,
  };
}
