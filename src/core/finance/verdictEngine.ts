// src/core/finance/verdictEngine.ts
//
// Turns "read the sample titles and judge for yourself" into a filterable
// column. Pairs up each segment's active-side and sold-side rows and
// applies a fixed rule set to decide how much trust that segment deserves
// — WITHOUT requiring a human to read titles or compare numbers by eye.

export interface SegmentCsvRow {
  categoryId: string;
  slotKeyword: string;
  segmentLabel: string;
  source: "active" | "sold";
  count: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sampleTitles: string[];
}

export type Verdict =
  | "READY"
  | "THIN_SAMPLE"
  | "PRICE_DIVERGENCE"
  | "LIKELY_PART"
  | "UNRESOLVED_MIX"
  | "ONE_SIDED"
  | "REVIEW";

const READY_MIN_COUNT = 4;
const THIN_MAX_COUNT = 2;
const PRICE_DIVERGENCE_THRESHOLD = 0.2;
const MIX_BUCKET_MIN_COUNT = 10;
const SPREAD_MIX_THRESHOLD = 4;

const TIER_LABEL_PATTERN = /\[tier \d+: £[\d.]+-£[\d.]+\]/;

function looksLikePartFromTitles(titles: string[]): boolean {
  const joined = titles.join(" ").toLowerCase();

  if (
    /\b(case only|charging case only|box only|spares?( and | & )?repair|faulty|not working|does not work|does not connect|for parts|left ear only|right ear only|left only|right only)\b/.test(
      joined,
    )
  ) {
    return true;
  }

  const mentionsCharging =
    /\bcharging\b/.test(joined) && /\bcase\b/.test(joined);
  const hasProductNoun =
    /\b(earbuds?|earphones?|headphones?|headset|airpods?|buds|pods)\b/.test(
      joined,
    );

  return mentionsCharging && !hasProductNoun;
}

function isSpreadTooWide(
  activeRow?: SegmentCsvRow,
  soldRow?: SegmentCsvRow,
): boolean {
  const bigger =
    (activeRow?.count ?? 0) >= (soldRow?.count ?? 0) ? activeRow : soldRow;
  if (!bigger || bigger.count <= MIX_BUCKET_MIN_COUNT) return false;

  const spread =
    bigger.medianPrice > 0
      ? (bigger.maxPrice - bigger.minPrice) / bigger.medianPrice
      : 0;

  return spread > SPREAD_MIX_THRESHOLD;
}

export function computeVerdict(
  label: string,
  activeRow?: SegmentCsvRow,
  soldRow?: SegmentCsvRow,
): Verdict {
  const anyRow = activeRow ?? soldRow;
  if (!anyRow) return "THIN_SAMPLE";

  if (label.includes("[part/accessory]")) return "LIKELY_PART";
  if (looksLikePartFromTitles(anyRow.sampleTitles)) return "LIKELY_PART";

  if (isSpreadTooWide(activeRow, soldRow)) return "UNRESOLVED_MIX";

  if (activeRow && soldRow) {
    const diff =
      Math.abs(activeRow.medianPrice - soldRow.medianPrice) /
      Math.max(soldRow.medianPrice, 0.01);

    if (
      activeRow.count >= READY_MIN_COUNT &&
      soldRow.count >= READY_MIN_COUNT
    ) {
      return diff <= PRICE_DIVERGENCE_THRESHOLD ? "READY" : "PRICE_DIVERGENCE";
    }

    if (activeRow.count <= THIN_MAX_COUNT && soldRow.count <= THIN_MAX_COUNT) {
      return "THIN_SAMPLE";
    }

    return "REVIEW";
  }

  const only = activeRow ?? soldRow!;
  return only.count >= READY_MIN_COUNT ? "ONE_SIDED" : "THIN_SAMPLE";
}

/**
 * ✅ FIX: overlap-based tier matching. Price-gap splitting runs
 * independently per side, so active and sold can produce a DIFFERENT
 * NUMBER of tiers — "tier 1" on one side is not guaranteed to be the
 * same real price band as "tier 1" on the other. Matching purely by
 * index (the previous approach) caused a clean, narrow active tier to
 * inherit a verdict from an entirely unrelated, much larger sold tier
 * it happened to share an index with.
 *
 * This instead computes actual price-range overlap between every
 * active/sold tier pair for a slot, greedily matches the pairs with the
 * largest overlap first, and leaves any tier with zero overlap against
 * every candidate on the other side genuinely unmatched (ONE_SIDED) —
 * which is the honest answer when the two sides' price-gap splits
 * don't correspond to the same real segment.
 */
function matchTiersByOverlap(
  activeTiers: SegmentCsvRow[],
  soldTiers: SegmentCsvRow[],
): Array<{ active?: SegmentCsvRow; sold?: SegmentCsvRow }> {
  const usedActive = new Set<number>();
  const usedSold = new Set<number>();

  const candidates: Array<{ ai: number; si: number; overlap: number }> = [];
  for (let ai = 0; ai < activeTiers.length; ai++) {
    for (let si = 0; si < soldTiers.length; si++) {
      const a = activeTiers[ai];
      const s = soldTiers[si];
      const overlap = Math.max(
        0,
        Math.min(a.maxPrice, s.maxPrice) - Math.max(a.minPrice, s.minPrice),
      );
      if (overlap > 0) candidates.push({ ai, si, overlap });
    }
  }
  candidates.sort((x, y) => y.overlap - x.overlap);

  const pairs: Array<{ active?: SegmentCsvRow; sold?: SegmentCsvRow }> = [];

  for (const c of candidates) {
    if (usedActive.has(c.ai) || usedSold.has(c.si)) continue;
    pairs.push({ active: activeTiers[c.ai], sold: soldTiers[c.si] });
    usedActive.add(c.ai);
    usedSold.add(c.si);
  }

  for (let ai = 0; ai < activeTiers.length; ai++) {
    if (!usedActive.has(ai)) pairs.push({ active: activeTiers[ai] });
  }
  for (let si = 0; si < soldTiers.length; si++) {
    if (!usedSold.has(si)) pairs.push({ sold: soldTiers[si] });
  }

  return pairs;
}

export function attachVerdicts(
  rows: SegmentCsvRow[],
): Array<SegmentCsvRow & { verdict: Verdict }> {
  const verdictByRow = new Map<SegmentCsvRow, Verdict>();

  const bySlot = new Map<string, SegmentCsvRow[]>();
  for (const row of rows) {
    const existing = bySlot.get(row.slotKeyword) ?? [];
    existing.push(row);
    bySlot.set(row.slotKeyword, existing);
  }

  for (const slotRows of bySlot.values()) {
    const tierRows = slotRows.filter((r) =>
      TIER_LABEL_PATTERN.test(r.segmentLabel),
    );
    const otherRows = slotRows.filter(
      (r) => !TIER_LABEL_PATTERN.test(r.segmentLabel),
    );

    // Non-tier labels ([model: X], [part/accessory], [other models],
    // [complete], [unmatched]) never embed a price range that shifts
    // between sides, so exact-label matching is safe here.
    const otherByLabel = new Map<
      string,
      { active?: SegmentCsvRow; sold?: SegmentCsvRow }
    >();
    for (const row of otherRows) {
      const existing = otherByLabel.get(row.segmentLabel) ?? {};
      if (row.source === "active") existing.active = row;
      else existing.sold = row;
      otherByLabel.set(row.segmentLabel, existing);
    }
    for (const { active, sold } of otherByLabel.values()) {
      const label = active?.segmentLabel ?? sold?.segmentLabel ?? "";
      const verdict = computeVerdict(label, active, sold);
      if (active) verdictByRow.set(active, verdict);
      if (sold) verdictByRow.set(sold, verdict);
    }

    // Tier labels get overlap-based matching instead of index/string matching.
    const activeTiers = tierRows.filter((r) => r.source === "active");
    const soldTiers = tierRows.filter((r) => r.source === "sold");
    const tierPairs = matchTiersByOverlap(activeTiers, soldTiers);

    for (const { active, sold } of tierPairs) {
      const label = active?.segmentLabel ?? sold?.segmentLabel ?? "";
      const verdict = computeVerdict(label, active, sold);
      if (active) verdictByRow.set(active, verdict);
      if (sold) verdictByRow.set(sold, verdict);
    }
  }

  return rows.map((row) => ({
    ...row,
    verdict: verdictByRow.get(row) ?? "REVIEW",
  }));
}
