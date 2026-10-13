import {
  buildStableChunkIdentity,
  KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS,
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS,
  type KnowledgeChunkingPolicy,
} from '@voice-agent/contracts';
import { BadRequestError } from '@voice-agent/errors';
import { computeContentHash } from './knowledge-text-normalizer.js';

export interface PreparedChunk {
  readonly ordinal: number;
  readonly text: string;
  readonly policyVersion: string;
  readonly contentIdentityValue: string;
  readonly chunkIdentity: string;
}

export interface ChunkKnowledgeTextInput {
  readonly text: string;
  readonly documentId: string;
  readonly policy: KnowledgeChunkingPolicy;
}

function findBoundary(text: string, start: number, end: number): number {
  const searchSlice = text.slice(start, end);

  const paraIdx = searchSlice.lastIndexOf('\n\n');
  if (paraIdx !== -1) return start + paraIdx + 2;

  const lineIdx = searchSlice.lastIndexOf('\n');
  if (lineIdx !== -1) return start + lineIdx + 1;

  const sentenceIdx = searchSlice.lastIndexOf('. ');
  if (sentenceIdx !== -1) return start + sentenceIdx + 2;

  const spaceIdx = searchSlice.lastIndexOf(' ');
  if (spaceIdx !== -1) return start + spaceIdx + 1;

  return end;
}

export function chunkKnowledgeText(input: ChunkKnowledgeTextInput): PreparedChunk[] {
  const { text, documentId, policy } = input;
  assertSafeChunkingPolicy(policy);
  const { policyVersion, maxChunkChars, overlapChars } = policy;

  if (!text || text.length === 0) {
    return [];
  }

  const chunks: PreparedChunk[] = [];
  const textLen = text.length;
  let aggregateChars = 0;
  let start = 0;
  let ordinal = 0;

  while (start < textLen) {
    const end = computeChunkEnd({ text, textLen, start, maxChunkChars, overlapChars });

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      const prospectiveOrdinal = ordinal + 1;
      const prospectiveAggregate = aggregateChars + chunkText.length;
      assertGenerationCaps(prospectiveOrdinal, prospectiveAggregate);
      chunks.push(buildChunk({ documentId, policyVersion, ordinal, chunkText }));
      ordinal = prospectiveOrdinal;
      aggregateChars = prospectiveAggregate;
    }

    if (end >= textLen) break;
    start = Math.max(start + 1, end - overlapChars);
  }

  return chunks;
}

function computeChunkEnd(options: {
  text: string;
  textLen: number;
  start: number;
  maxChunkChars: number;
  overlapChars: number;
}): number {
  const { text, textLen, start, maxChunkChars, overlapChars } = options;
  const end = start + maxChunkChars;
  if (end >= textLen) return textLen;
  const boundaryStart = Math.max(start + maxChunkChars - overlapChars, start + 1);
  const chosen = findBoundary(text, boundaryStart, end);
  return chosen > start ? chosen : end;
}

function buildChunk(options: {
  documentId: string;
  policyVersion: string;
  ordinal: number;
  chunkText: string;
}): PreparedChunk {
  const { documentId, policyVersion, ordinal, chunkText } = options;
  const chunkHash = computeContentHash(chunkText);
  return {
    ordinal,
    text: chunkText,
    policyVersion,
    contentIdentityValue: chunkHash,
    chunkIdentity: buildStableChunkIdentity({
      documentId,
      policyVersion,
      ordinal,
      contentIdentityValue: chunkHash,
    }),
  };
}

function assertGenerationCaps(ordinal: number, aggregateChars: number): void {
  if (ordinal > KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS) {
    throw new BadRequestError(
      `Knowledge chunking stopped: too many chunks (limit ${KNOWLEDGE_CHUNK_MAX_GENERATED_CHUNKS}) for document`,
    );
  }
  if (aggregateChars > KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS) {
    throw new BadRequestError(
      `Knowledge chunking stopped: aggregate chunk characters exceed ${KNOWLEDGE_CHUNK_MAX_AGGREGATE_CHARS}`,
    );
  }
}

function assertSafeChunkingPolicy(policy: KnowledgeChunkingPolicy): void {
  if (
    !policy ||
    typeof policy.policyVersion !== 'string' ||
    policy.policyVersion.trim().length === 0
  ) {
    throw new BadRequestError('Knowledge chunking policy version must not be empty');
  }
  assertChunkSizeBounds(policy.maxChunkChars);
  assertOverlapBounds(policy.overlapChars, policy.maxChunkChars);
}

function assertChunkSizeBounds(maxChunkChars: number): void {
  if (
    !Number.isInteger(maxChunkChars) ||
    maxChunkChars <= 0 ||
    maxChunkChars > KNOWLEDGE_CHUNK_MAX_CHARS
  ) {
    throw new BadRequestError(
      `Knowledge chunk maxChunkChars ${maxChunkChars} exceeds maximum allowed ${KNOWLEDGE_CHUNK_MAX_CHARS}`,
    );
  }
}

function assertOverlapBounds(overlapChars: number, maxChunkChars: number): void {
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars * 2 > maxChunkChars) {
    throw new BadRequestError(
      `Knowledge chunk overlapChars ${overlapChars} must not exceed 50% of maxChunkChars ${maxChunkChars}`,
    );
  }
}
