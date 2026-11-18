/**
 * Busca v2 (DEC-067): reconstrói o texto contínuo de trechos CONSECUTIVOS de um
 * documento (os trechos v1 se sobrepõem até 50% e são cortados em limite de
 * frase/palavra), para que uma seção cortada entre dois trechos vire uma
 * passagem inteira. Sem leitura além dos trechos recebidos.
 */
export interface StitchableChunk {
  readonly ordinal: number;
  readonly text: string;
}

export interface StitchedRun<T extends StitchableChunk> {
  readonly text: string;
  /** Início de cada trecho no texto costurado, em ordem. */
  readonly segments: ReadonlyArray<{ readonly chunk: T; readonly start: number }>;
}

const PROBE = 60;
/** Sobreposição menor que isto não é reconhecida (evita colar por coincidência). */
const MIN_OVERLAP = 16;

/** Sobreposição curta (< PROBE): o final de `prev` é o início de `next`. */
function shortOverlap(prev: string, next: string): number {
  for (let len = Math.min(PROBE - 1, prev.length, next.length); len >= MIN_OVERLAP; len--) {
    if (prev.endsWith(next.slice(0, len))) return len;
  }
  return 0;
}

/** Quanto do início de `next` repete o final de `prev` (0 se não houver sobreposição). */
export function overlapLength(prev: string, next: string): number {
  const probe = next.slice(0, Math.min(PROBE, next.length));
  if (probe.length < PROBE) return shortOverlap(prev, next);
  for (
    let at = prev.indexOf(probe, Math.max(0, prev.length - next.length));
    at >= 0;
    at = prev.indexOf(probe, at + 1)
  ) {
    const tail = prev.slice(at);
    if (next.startsWith(tail)) return tail.length;
  }
  return shortOverlap(prev, next);
}

function appendChunk<T extends StitchableChunk>(
  run: { text: string; segments: { chunk: T; start: number }[] },
  chunk: T,
) {
  if (run.segments.length === 0) {
    run.segments.push({ chunk, start: 0 });
    run.text = chunk.text;
    return;
  }
  const overlap = overlapLength(run.text, chunk.text);
  const separator = overlap > 0 ? '' : '\n\n';
  const start = run.text.length - overlap + separator.length;
  run.segments.push({ chunk, start });
  run.text = `${run.text}${separator}${chunk.text.slice(overlap)}`;
}

/** Agrupa trechos de UM documento em sequências de ordinais consecutivos. */
export function stitchChunks<T extends StitchableChunk>(chunks: readonly T[]): StitchedRun<T>[] {
  const sorted = [...chunks].sort((a, b) => a.ordinal - b.ordinal);
  const runs: { text: string; segments: { chunk: T; start: number }[] }[] = [];
  let previous: number | undefined;
  for (const chunk of sorted) {
    if (previous === undefined || chunk.ordinal !== previous + 1)
      runs.push({ text: '', segments: [] });
    appendChunk(runs[runs.length - 1]!, chunk);
    previous = chunk.ordinal;
  }
  return runs;
}

/** Trechos ocupados por [start, end) no texto costurado. */
export function chunkSpan<T extends StitchableChunk>(
  run: StitchedRun<T>,
  start: number,
  end: number,
) {
  const containing = (at: number) =>
    [...run.segments].reverse().find((s) => s.start <= at) ?? run.segments[0]!;
  return { first: containing(start).chunk, last: containing(Math.max(start, end - 1)).chunk };
}
