import { Unzlib } from 'fflate';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';

const CHUNK = 1024;

function streamRanges(latin1: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const start = /(?<!end)stream\r?\n/g;
  for (let m = start.exec(latin1); m; m = start.exec(latin1)) {
    const from = m.index + m[0].length;
    const to = latin1.indexOf('endstream', from);
    if (to < 0) break;
    ranges.push([from, to]);
    start.lastIndex = to;
  }
  return ranges;
}

/** Descompacta em blocos pequenos (≤ ~1 MiB por bloco) somando a saída. */
function inflatedSize(data: Uint8Array, budget: number): number {
  let total = 0;
  const inflater = new Unzlib((chunk) => {
    total += chunk.length;
    if (total > budget) throw new KnowledgeExtractionError(CODES.ARCHIVE_LIMIT_EXCEEDED);
  });
  try {
    for (let i = 0; i < data.length; i += CHUNK) inflater.push(data.subarray(i, i + CHUNK));
  } catch (error) {
    if (error instanceof KnowledgeExtractionError) throw error;
  }
  return total;
}

/**
 * Antes do parser: soma o tamanho descompactado (zlib/Flate) de todos os
 * streams e recusa acima do limite (bomba de compressão). Streams que não são
 * Flate são ignorados aqui (cobertos pelo prazo e pelos limites do processo).
 */
export function assertPdfInflationWithinLimit(bytes: Uint8Array, maxBytes: number): void {
  const latin1 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  let total = 0;
  for (const [from, to] of streamRanges(latin1)) {
    total += inflatedSize(bytes.subarray(from, to), maxBytes - total);
  }
}
