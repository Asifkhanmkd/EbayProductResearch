// src/core/finance/segmentAnalyzer.ts
//
// Automatically splits a noisy keyword-search result into meaningful
// sub-groups WITHOUT requiring a human to read every title.
//
// Three passes, in order:
//   1. Phrase-based split: pulls out "accessory/part-only" listings.
//   2. Model-token split: catches distinct named models even when they
//      sit in the SAME price band (e.g. Monster AC530 vs Aura Fit GT37).
//      Capped to the top N tokens by listing count, so brands that
//      stamp a unique regulatory/SKU code on every listing (e.g. Apple's
//      A2031, MV7N2ZM, etc.) don't explode into dozens of one-listing
//      "models" — anything beyond the cap folds back into pass 3.
//   3. Price-gap split: whatever remains gets clustered by price jumps.

export interface TitledPrice {
  title: string;
  price: number;
}

export interface Segment {
  label: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sampleTitles: string[];
}

const PART_ONLY_PATTERN =
  /\b(case only|charging case only|box only|spares?( and | & )?repair|faulty|not working|does not work|does not connect|for parts|read description|left ear only|right ear only|left only|right only|left earbud only|right earbud only|left bud only|right bud only)\b/i;

function isPartOnlyLoose(title: string): boolean {
  const lower = title.toLowerCase();
  if (PART_ONLY_PATTERN.test(lower)) return true;
  if (lower.includes("empty") && lower.includes("case")) return true;
  const hasProductNoun = /\b(earbuds?|earphones?|headphones?|headset)\b/.test(
    lower,
  );
  if (/\bcase\b/.test(lower) && !hasProductNoun && lower.length < 40) {
    return true;
  }
  return false;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildSegment(label: string, items: TitledPrice[]): Segment {
  const prices = items.map((i) => i.price);
  return {
    label,
    count: items.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    medianPrice: median(prices),
    sampleTitles: items.slice(0, 3).map((i) => i.title),
  };
}

function splitByPartType(items: TitledPrice[]): {
  partOnly: TitledPrice[];
  complete: TitledPrice[];
} {
  const partOnly: TitledPrice[] = [];
  const complete: TitledPrice[] = [];

  for (const item of items) {
    if (isPartOnlyLoose(item.title)) {
      partOnly.push(item);
    } else {
      complete.push(item);
    }
  }

  return { partOnly, complete };
}

const MODEL_TOKEN_PATTERN =
  /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z]{1,8}(?:-[A-Za-z0-9]+)*\d+[A-Za-z0-9-]*\b/g;

const MODEL_TOKEN_EXCLUSIONS = new Set([
  "4g",
  "5g",
  "4k",
  "8k",
  "16gb",
  "32gb",
  "64gb",
  "128gb",
  "256gb",
  "512gb",
  "1tb",
  "2tb",
  "24mp",
  "48mp",
  "108mp",
  "45w",
  "65w",
  "100w",
]);

function extractModelTokens(title: string): string[] {
  const matches = title.match(MODEL_TOKEN_PATTERN) ?? [];

  return matches
    .map((token) => token.replace(/[^a-z0-9-]/gi, ""))
    .filter((token) => {
      const normalized = token.toLowerCase();
      if (MODEL_TOKEN_EXCLUSIONS.has(normalized)) return false;
      if (/^20\d{2}$/.test(normalized)) return false;
      return true;
    });
}

function extractSingleModelToken(title: string): string | null {
  const unique = new Set(extractModelTokens(title).map((t) => t.toUpperCase()));
  if (unique.size === 1) {
    return Array.from(unique)[0];
  }
  return null;
}

/**
 * Groups items by a single unambiguous model token, capped to the
 * top `maxModelGroups` tokens by listing count.
 *
 * Diversity gate: need at least 2 distinct tokens overall to treat
 * this as real model diversity rather than noise (unchanged).
 *
 * ✅ NEW: cap. Tokens beyond the top N by count are NOT given their
 * own segment — they're folded back into `ungrouped` so pass 3
 * (price-gap clustering) absorbs them into a generic tier instead.
 * This is what stops brands like Apple, which stamp a unique
 * regulatory/SKU code on nearly every listing, from exploding a slot
 * into dozens of one-listing "[model: X]" rows.
 */
function splitByModelToken(
  items: TitledPrice[],
  maxModelGroups: number = 5,
): {
  grouped: Map<string, TitledPrice[]>;
  ungrouped: TitledPrice[];
} {
  const byToken = new Map<string, TitledPrice[]>();
  const noToken: TitledPrice[] = [];

  for (const item of items) {
    const token = extractSingleModelToken(item.title);
    if (token) {
      const existing = byToken.get(token);
      if (existing) {
        existing.push(item);
      } else {
        byToken.set(token, [item]);
      }
    } else {
      noToken.push(item);
    }
  }

  if (byToken.size < 2) {
    return { grouped: new Map(), ungrouped: items };
  }

  const sortedByCount = Array.from(byToken.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const topTokens = sortedByCount.slice(0, maxModelGroups);
  const overflowTokens = sortedByCount.slice(maxModelGroups);

  const grouped = new Map(topTokens);
  const overflowItems = overflowTokens.flatMap(([, groupItems]) => groupItems);

  return { grouped, ungrouped: [...noToken, ...overflowItems] };
}

function splitByPriceGaps(
  items: TitledPrice[],
  gapThreshold: number = 1.5,
  maxSegments: number = 4,
): TitledPrice[][] {
  if (items.length < 4) return [items];

  const sorted = [...items].sort((a, b) => a.price - b.price);
  const cutIndices: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price;
    const curr = sorted[i].price;
    if (prev > 0 && curr / prev >= gapThreshold) {
      cutIndices.push(i);
    }
  }

  const chosenCuts = cutIndices.slice(0, maxSegments - 1);

  const segments: TitledPrice[][] = [];
  let start = 0;
  for (const cut of chosenCuts) {
    segments.push(sorted.slice(start, cut));
    start = cut;
  }
  segments.push(sorted.slice(start));

  return segments.filter((seg) => seg.length > 0);
}

export function autoSegment(
  slotKeyword: string,
  items: TitledPrice[],
): Segment[] {
  if (items.length === 0) return [];

  const { partOnly, complete } = splitByPartType(items);
  const segments: Segment[] = [];

  if (partOnly.length > 0) {
    segments.push(buildSegment(`${slotKeyword} [part/accessory]`, partOnly));
  }

  const { grouped, ungrouped } = splitByModelToken(complete);

  if (grouped.size > 0) {
    for (const [token, tokenItems] of grouped.entries()) {
      segments.push(
        buildSegment(`${slotKeyword} [model: ${token}]`, tokenItems),
      );
    }
  }

  if (ungrouped.length > 0) {
    const priceTiers = splitByPriceGaps(ungrouped);
    priceTiers.forEach((tier, idx) => {
      const label =
        priceTiers.length > 1
          ? `${slotKeyword} [tier ${idx + 1}: £${Math.min(...tier.map((t) => t.price)).toFixed(0)}-£${Math.max(...tier.map((t) => t.price)).toFixed(0)}]`
          : grouped.size > 0
            ? `${slotKeyword} [other models]`
            : `${slotKeyword} [complete]`;
      segments.push(buildSegment(label, tier));
    });
  }

  return segments.sort((a, b) => b.count - a.count);
}
