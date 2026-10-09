export function extractQueryTokens(queryText: string): string[] {
  const allTokens = queryText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const significant = allTokens.filter((token) => token.length > 2);
  return significant.length > 0 ? significant : allTokens;
}

export function computeLexicalScore(text: string, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0.1;

  const lowerText = text.toLowerCase();
  let matchedTokens = 0;
  let totalOccurrences = 0;

  for (const token of tokens) {
    let count = 0;
    let pos = lowerText.indexOf(token);
    while (pos !== -1) {
      count++;
      pos = lowerText.indexOf(token, pos + token.length);
    }

    if (count > 0) {
      matchedTokens++;
      totalOccurrences += count;
    }
  }

  if (matchedTokens === 0) return 0.0;

  const coverageScore = matchedTokens / tokens.length;
  const frequencyBonus = Math.min(0.3, totalOccurrences * 0.05);
  const rawScore = coverageScore * 0.7 + frequencyBonus;

  return Math.round(Math.min(1.0, rawScore) * 10000) / 10000;
}
