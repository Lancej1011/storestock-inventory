/**
 * Trigram similarity — equivalent to PostgreSQL's pg_trgm similarity().
 * Returns a score between 0 (no match) and 1 (identical).
 */
function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase()}  `;
  const tgrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    tgrams.add(padded.slice(i, i + 3));
  }
  return tgrams;
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tA = trigrams(a);
  const tB = trigrams(b);
  let intersection = 0;
  for (const t of tA) {
    if (tB.has(t)) intersection++;
  }
  return (2 * intersection) / (tA.size + tB.size);
}
