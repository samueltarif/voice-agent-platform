import type { ChunkRow } from './knowledge-retrieval-v2-queries.js';
import { foldKnowledgeText } from './knowledge-query-terms.js';
import { chunkSpan, stitchChunks, type StitchedRun } from './knowledge-chunk-stitcher.js';
import { segmentKnowledgeText } from './knowledge-passage-segmenter.js';

/** Passagem candidata da v2 (DEC-067) com o documento e os trechos gravados que ocupa. */
export interface PassageCandidate {
  readonly row: ChunkRow;
  readonly lastOrdinal: number;
  readonly text: string;
  readonly heading?: string | undefined;
  readonly foldedText: string;
  readonly foldedHeading: string;
  readonly foldedTitle: string;
}

type RunChunk = { ordinal: number; text: string; row: ChunkRow };

function fromRun(run: StitchedRun<RunChunk>, seen: Set<string>): PassageCandidate[] {
  const out: PassageCandidate[] = [];
  for (const p of segmentKnowledgeText(run.text)) {
    const span = chunkSpan(run, p.start, p.start + p.text.length);
    const key = `${span.first.row.doc.id}\u0000${p.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      row: span.first.row,
      lastOrdinal: span.last.ordinal,
      text: p.text,
      heading: p.heading,
      foldedText: foldKnowledgeText(p.text),
      foldedHeading: foldKnowledgeText(p.heading ?? ''),
      foldedTitle: foldKnowledgeText(span.first.row.doc.title),
    });
  }
  return out;
}

/**
 * Trechos (candidatos + vizinhos) → passagens: costura os trechos consecutivos
 * de cada documento e divide o texto em passagens; repetições causadas pela
 * sobreposição entre trechos aparecem uma vez só.
 */
export function buildPassageCandidates(rows: readonly ChunkRow[]): PassageCandidate[] {
  const byDoc = new Map<string, RunChunk[]>();
  const unique = new Map(rows.map((r) => [r.chunk.id, r]));
  for (const row of unique.values()) {
    const list = byDoc.get(row.doc.id) ?? [];
    list.push({ ordinal: row.chunk.ordinal, text: row.chunk.text, row });
    byDoc.set(row.doc.id, list);
  }
  const seen = new Set<string>();
  return [...byDoc.values()].flatMap((chunks) =>
    stitchChunks(chunks).flatMap((run) => fromRun(run, seen)),
  );
}
