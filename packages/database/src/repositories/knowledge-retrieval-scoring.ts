/**
 * Pontuação lexical ponderada (sem IA). Termos que aparecem em quase todos os
 * trechos candidatos (ex.: o nome da empresa) pesam menos que termos raros
 * (ex.: "transmissor", "pressao"), no estilo IDF. Determinística.
 */

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let pos = text.indexOf(term);
  while (pos !== -1) {
    count++;
    pos = text.indexOf(term, pos + term.length);
  }
  return count;
}

/** Peso de cada termo: log(1 + N / df), com df mínimo 1. */
export function computeTermWeights(
  foldedTexts: readonly string[],
  terms: readonly string[],
): number[] {
  const total = Math.max(1, foldedTexts.length);
  return terms.map((term) => {
    const df = foldedTexts.filter((t) => t.includes(term)).length;
    return Math.log(1 + total / Math.max(1, df));
  });
}

/**
 * 0..1: cobertura ponderada dos termos (70%) + bônus de frequência (até 30%).
 * Sem termos de busca, devolve 0,1 para manter ordenação estável.
 */
export function scoreKnowledgeChunk(
  foldedText: string,
  terms: readonly string[],
  weights: readonly number[],
): number {
  if (terms.length === 0) return 0.1;
  let matchedWeight = 0;
  let totalWeight = 0;
  let occurrences = 0;
  terms.forEach((term, i) => {
    const weight = weights[i] ?? 1;
    totalWeight += weight;
    const count = countOccurrences(foldedText, term);
    if (count > 0) {
      matchedWeight += weight;
      occurrences += count;
    }
  });
  if (matchedWeight === 0 || totalWeight === 0) return 0;
  const coverage = matchedWeight / totalWeight;
  const frequencyBonus = Math.min(0.3, occurrences * 0.05);
  return Math.round(Math.min(1, coverage * 0.7 + frequencyBonus) * 10000) / 10000;
}
