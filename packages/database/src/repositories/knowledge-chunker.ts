import { buildStableChunkIdentity, type KnowledgeChunkingPolicy } from '@voice-agent/contracts';
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
  const { policyVersion, maxChunkChars, overlapChars } = policy;

  if (!text || text.length === 0) {
    return [];
  }

  const chunks: PreparedChunk[] = [];
  const textLen = text.length;
  let start = 0;
  let ordinal = 0;

  while (start < textLen) {
    let end = start + maxChunkChars;

    if (end < textLen) {
      const boundaryStart = Math.max(start + maxChunkChars - overlapChars, start + 1);
      const chosen = findBoundary(text, boundaryStart, end);
      if (chosen > start) {
        end = chosen;
      }
    } else {
      end = textLen;
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      const chunkHash = computeContentHash(chunkText);
      const chunkIdentity = buildStableChunkIdentity({
        documentId,
        policyVersion,
        ordinal,
        contentIdentityValue: chunkHash,
      });

      chunks.push({
        ordinal,
        text: chunkText,
        policyVersion,
        contentIdentityValue: chunkHash,
        chunkIdentity,
      });
      ordinal++;
    }

    if (end >= textLen) break;
    start = Math.max(start + 1, end - overlapChars);
  }

  return chunks;
}
