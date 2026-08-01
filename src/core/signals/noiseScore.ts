//=========================   Version 1 ===============================//

/* export function computeNoiseScore(title: string, keyword: string): number {
  if (!title || !keyword) return 1;

  const t = title.toLowerCase();
  const tokens = keyword.toLowerCase().split(/\s+/);

  // ----------------------------
  // 1. TOKEN PRESENCE
  // ----------------------------
  let matchCount = 0;
  tokens.forEach((token) => {
    if (t.includes(token)) matchCount++;
  });

  const coverage = matchCount / tokens.length;

  // ----------------------------
  // 2. "FOR" MISALIGNMENT
  // ----------------------------
  const forIndex = t.indexOf(" for ");
  let forPenalty = 0;

  if (forIndex !== -1) {
    const keywordIndex = t.indexOf(tokens[0]);

    if (keywordIndex > forIndex) {
      // keyword appears AFTER "for" → accessory pattern
      forPenalty = 1;
    }
  }

  // ----------------------------
  // 3. DISTANCE PENALTY
  // (keyword appears late in title)
  // ----------------------------
  const firstIndex = t.indexOf(tokens[0]);

  const distancePenalty = firstIndex === -1 ? 1 : Math.min(1, firstIndex / 60);

  // ----------------------------
  // FINAL NOISE SCORE
  // (higher = worse)
  // ----------------------------
  const noise = 0.5 * (1 - coverage) + 0.3 * forPenalty + 0.2 * distancePenalty;

  return Math.min(1, noise);
}
 */

//=========================   Version 2 ===============================//

// src/core/signals/noiseScore.ts

export function computeNoiseScore(title: string, keyword: string): number {
  if (!title || !keyword) return 1;

  const t = title.toLowerCase();
  const tokens = keyword.toLowerCase().split(/\s+/);

  // 1. TOKEN COVERAGE MATCHING INDEX
  let matchCount = 0;
  tokens.forEach((token) => {
    if (t.includes(token)) matchCount++;
  });
  const coverage = matchCount / tokens.length;

  // 2. CONTEXT ALIGNMENT WORD SPLITS
  const wordCount = t.split(/\s+/).length;
  const complexityPenalty = Math.min(1, wordCount / 20);

  // 3. TITLE ENTITY DILUTION CHECKS
  const numberGroups = t.match(/\d+/g) || [];
  const keywordNumbers = tokens.filter((token) => /\d/.test(token));
  const extraNumbers = numberGroups.length - keywordNumbers.length;
  const dilutionPenalty = Math.min(1, extraNumbers / 3);

  // COMBINE CLEAN METRICS (0% Dependencies on dead NER code blocks)
  const noise =
    0.4 * (1 - coverage) + 0.3 * complexityPenalty + 0.3 * dilutionPenalty;
  return Math.min(1, noise);
}
