import type { PassageMatch, TermStats } from './knowledge-evidence-classifier-v2.js';

/**
 * Pontuação de passagens da v2 (DEC-067), estilo BM25: IDF do ESCOPO,
 * normalização pelo tamanho da passagem, termos genéricos com meio peso,
 * termo presente só no título da seção conta como uma ocorrência, reforço
 * quando o termo central está também no título da seção ou do documento
 * (reforço apenas: o título nunca torna a passagem DIRECT — D-RB8) e bônus de
 * proximidade entre termos centrais. Determinística.
 */
const K1 = 1.2;
const B = 0.75;
const GENERIC_WEIGHT = 0.5;
const HEADING_BOOST = 0.3;
const TITLE_BOOST = 0.15;
const PROXIMITY_BONUS = 0.2;
const PROXIMITY_WINDOW = 40;

export interface RankInput {
  readonly match: PassageMatch;
  readonly inTitle: readonly boolean[];
  readonly length: number;
  /** Posições (texto normalizado) das ocorrências de termos centrais. */
  readonly centralPositions: readonly number[][];
}

function termScore(tf: number, idf: number, lengthRatio: number): number {
  if (tf === 0) return 0;
  return (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + B * lengthRatio));
}

/** Há ocorrências de dois termos centrais diferentes a até 40 caracteres. */
function hasProximity(positions: readonly number[][]): boolean {
  const all = positions.flatMap((list, term) => list.map((at) => ({ at, term })));
  all.sort((a, b) => a.at - b.at);
  return all.some(
    (p, i) => i > 0 && p.term !== all[i - 1]!.term && p.at - all[i - 1]!.at <= PROXIMITY_WINDOW,
  );
}

/** Termo só no título da seção conta como uma ocorrência (o título descreve a seção). */
function occurrences(match: PassageMatch, i: number): { tf: number; inHeading: boolean } {
  const tf = match.inText[i] ?? 0;
  const inHeading = match.inHeading[i] ?? false;
  return { tf: tf === 0 && inHeading ? 1 : tf, inHeading: inHeading && tf > 0 };
}

/** Contribuição de um termo: BM25 + reforços de título (só para termos centrais). */
function termContribution(input: RankInput, at: { s: TermStats; i: number }, ratio: number) {
  const { s, i } = at;
  const { tf, inHeading } = occurrences(input.match, i);
  if (!s.central) return GENERIC_WEIGHT * termScore(tf, s.idf, ratio);
  const headingBoost = inHeading ? HEADING_BOOST * s.idf : 0;
  const titleBoost = input.inTitle[i] ? TITLE_BOOST * s.idf : 0;
  return termScore(tf, s.idf, ratio) + headingBoost + titleBoost;
}

export function rawPassageScore(
  input: RankInput,
  stats: readonly TermStats[],
  avgLength: number,
): number {
  const ratio = input.length / Math.max(1, avgLength);
  const score = stats.reduce((sum, s, i) => sum + termContribution(input, { s, i }, ratio), 0);
  const bestIdf = Math.max(0, ...stats.filter((s) => s.central).map((s) => s.idf));
  return score + (hasProximity(input.centralPositions) ? PROXIMITY_BONUS * bestIdf : 0);
}

/** 0..1 relativo à melhor passagem (4 casas), para exibir e cortar ruído. */
export function normalizeScores(raw: readonly number[]): number[] {
  const best = Math.max(0, ...raw);
  return raw.map((r) => (best === 0 ? 0 : Math.round((r / best) * 10000) / 10000));
}
