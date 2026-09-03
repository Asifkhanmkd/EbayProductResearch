// src/test/categoryExplorer.ts

import fs from "fs";
import path from "path";

import { ebayClient } from "../core/ebayClient";

import { MarketPipelineAdapter } from "../core/market/marketAdapter";
import { computeSellThrough } from "../core/finance/marketMetrics";
import {
  autoSegment,
  Segment,
  TitledPrice,
} from "../core/finance/segmentAnalyzer";
import { attachVerdicts, SegmentCsvRow } from "../core/finance/verdictEngine";

interface ProductSlot {
  brand: string;
  noun: string;
  sampleTitles: string[];
  count: number;
  items: any[];
}

interface SlotMetricsRow {
  categoryId: string;
  slotKeyword: string;
  soldCount: number;
  activeCount: number;
  strPercent: number;
  medianSold: number;
  medianAsk: number;
}

interface ModelCandidate {
  categoryId: string;
  slotKeyword: string;
  modelToken: string;
  modelKeyword: string;
  sourceListingCount: number;
  sampleTitles: string[];
}

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const STOPWORDS = new Set([
  "new",
  "brand",
  "boxed",
  "sealed",
  "for",
  "the",
  "and",
  "with",
  "set",
  "lot",
  "bulk",
  "pcs",
  "piece",
  "pieces",
  "good",
  "very",
  "pristine",
  "excellent",
  "condition",
  "grade",
  "plus",
  "max",
  "mini",
  "ultra",
  "pro",
]);

const PRODUCT_NOUNS = new Set([
  "phone",
  "smartphone",
  "charger",
  "case",
  "cover",
  "screen",
  "protector",
  "cable",
]);

const BAD_NOUNS = new Set(["a", "uk", "bh", "seller", "condition"]);

function inferBrand(tokens: string[]): string {
  return tokens[0] ?? "unknown";
}

function inferNoun(tokens: string[]): string {
  for (const t of tokens) {
    if (PRODUCT_NOUNS.has(t)) return t;
  }

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!STOPWORDS.has(t)) return t;
  }
  return tokens[tokens.length - 1] ?? "unknown";
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

function discoverModelCandidates(
  categoryId: string,
  slot: ProductSlot,
): ModelCandidate[] {
  const byModel = new Map<string, { count: number; sampleTitles: string[] }>();

  for (const item of slot.items) {
    const title = String(item.title ?? "").trim();
    if (!title) continue;

    const seenInThisTitle = new Set(
      extractModelTokens(title).map((token) => token.toUpperCase()),
    );

    for (const modelToken of seenInThisTitle) {
      const existing = byModel.get(modelToken);

      if (existing) {
        existing.count += 1;
        if (existing.sampleTitles.length < 3) {
          existing.sampleTitles.push(title);
        }
      } else {
        byModel.set(modelToken, {
          count: 1,
          sampleTitles: [title],
        });
      }
    }
  }

  return Array.from(byModel.entries())
    .filter(([, value]) => value.count >= 2)
    .map(([modelToken, value]) => ({
      categoryId,
      slotKeyword: `${slot.brand} ${slot.noun}`,
      modelToken,
      modelKeyword: `${slot.brand} ${modelToken}`,
      sourceListingCount: value.count,
      sampleTitles: value.sampleTitles,
    }))
    .sort((a, b) => b.sourceListingCount - a.sourceListingCount);
}

async function exploreLeafCategory(categoryId: string) {
  console.log(`📂 Exploring categoryId=${categoryId} ...`);

  const broadKeyword = "*";

  const { items } = await ebayClient.searchAll(undefined, {
    marketplace: "EBAY_GB",
    categoryId,
    limit: 50,
    pages: 3,
    soldHistoryOnly: false,
  });

  console.log(`   ➜ Fetched ${items.length} active listings`);

  const slotMap = new Map<string, ProductSlot>();

  for (const item of items) {
    const title: string = (item.title || "").trim();
    if (!title) continue;

    const tokens = tokenizeTitle(title);
    if (tokens.length === 0) continue;

    const brand = inferBrand(tokens);
    const noun = inferNoun(tokens);

    const key = `${brand}::${noun}`;
    const existing = slotMap.get(key);

    if (existing) {
      existing.count += 1;
      if (existing.sampleTitles.length < 5) {
        existing.sampleTitles.push(title);
      }
      existing.items.push(item);
    } else {
      slotMap.set(key, {
        brand,
        noun,
        count: 1,
        sampleTitles: [title],
        items: [item],
      });
    }
  }

  const slots = Array.from(slotMap.values())
    .filter((slot) => !BAD_NOUNS.has(slot.noun))
    .sort((a, b) => b.count - a.count);

  console.log("🏆 Top discovered product slots in this category:");
  for (const slot of slots.slice(0, 20)) {
    console.log(` - [${slot.brand} ${slot.noun}] ➜ ${slot.count} listings`);
    for (const t of slot.sampleTitles) {
      console.log(`      • ${t}`);
    }
  }

  const modelCandidates = slots
    .slice(0, 20)
    .flatMap((slot) => discoverModelCandidates(categoryId, slot))
    .sort((a, b) => b.sourceListingCount - a.sourceListingCount);

  if (modelCandidates.length > 0) {
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const header = [
      "categoryId",
      "slotKeyword",
      "modelToken",
      "modelKeyword",
      "sourceListingCount",
      "sampleTitles",
    ].join(",");

    const lines = modelCandidates.map((candidate) =>
      [
        candidate.categoryId,
        `"${candidate.slotKeyword.replace(/"/g, '""')}"`,
        `"${candidate.modelToken.replace(/"/g, '""')}"`,
        `"${candidate.modelKeyword.replace(/"/g, '""')}"`,
        candidate.sourceListingCount,
        `"${candidate.sampleTitles.join(" | ").replace(/"/g, '""')}"`,
      ].join(","),
    );

    const filename = path.join(outputDir, `model_candidates_${categoryId}.csv`);
    fs.writeFileSync(filename, [header, ...lines].join("\n"), "utf8");

    console.log(
      `🧬 Exported ${modelCandidates.length} model candidates to ${filename}`,
    );
  }

  const metricsRows: SlotMetricsRow[] = [];
  const allSegmentRows: SegmentCsvRow[] = [];

  for (const slot of slots.slice(0, 5)) {
    const row = await evaluateSlot(categoryId, slot, allSegmentRows);
    if (row) {
      metricsRows.push(row);
    }
  }

  if (metricsRows.length > 0) {
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = path.join(
      outputDir,
      `category_explorer_${categoryId}.csv`,
    );

    const header = [
      "categoryId",
      "slotKeyword",
      "soldCount",
      "activeCount",
      "strPercent",
      "medianSold",
      "medianAsk",
    ].join(",");

    const lines = metricsRows.map((row) =>
      [
        row.categoryId,
        `"${row.slotKeyword.replace(/"/g, '""')}"`,
        row.soldCount,
        row.activeCount,
        row.strPercent.toFixed(1),
        row.medianSold.toFixed(2),
        row.medianAsk.toFixed(2),
      ].join(","),
    );

    const csvContent = [header, ...lines].join("\n");
    fs.writeFileSync(filename, csvContent, "utf8");

    console.log(
      `\n📝 Exported ${metricsRows.length} slot metrics rows to ${filename}`,
    );
  }

  // 🧠 Attach a verdict to every segment row — READY / THIN_SAMPLE /
  // LIKELY_PART / PRICE_DIVERGENCE / UNRESOLVED_MIX / ONE_SIDED / REVIEW —
  // computed from fixed rules, so you can filter the CSV instead of
  // reading every sample title by hand.
  if (allSegmentRows.length > 0) {
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const withVerdicts = attachVerdicts(allSegmentRows);

    const header = [
      "categoryId",
      "slotKeyword",
      "segmentLabel",
      "source",
      "count",
      "minPrice",
      "maxPrice",
      "medianPrice",
      "verdict",
      "sampleTitles",
    ].join(",");

    const lines = withVerdicts.map((seg) =>
      [
        seg.categoryId,
        `"${seg.slotKeyword.replace(/"/g, '""')}"`,
        `"${seg.segmentLabel.replace(/"/g, '""')}"`,
        seg.source,
        seg.count,
        seg.minPrice.toFixed(2),
        seg.maxPrice.toFixed(2),
        seg.medianPrice.toFixed(2),
        seg.verdict,
        `"${seg.sampleTitles.join(" | ").replace(/"/g, '""')}"`,
      ].join(","),
    );

    const filename = path.join(outputDir, `slot_segments_${categoryId}.csv`);
    fs.writeFileSync(filename, [header, ...lines].join("\n"), "utf8");

    const readyCount = withVerdicts.filter((s) => s.verdict === "READY").length;
    console.log(
      `🧩 Exported ${withVerdicts.length} auto-detected price segments to ${filename} (${readyCount} marked READY)`,
    );
  }
}

async function evaluateSlot(
  categoryId: string,
  slot: ProductSlot,
  allSegmentRows: SegmentCsvRow[],
): Promise<SlotMetricsRow | null> {
  const keyword = `${slot.brand} ${slot.noun}`.trim();
  console.log(`\n🔎 Evaluating slot [${keyword}] ...`);

  const soldResult = await ebayClient.searchAll(keyword, {
    marketplace: "EBAY_GB",
    categoryId,
    soldHistoryOnly: true,
    pages: 3,
  });

  const activeResult = await ebayClient.searchAll(keyword, {
    marketplace: "EBAY_GB",
    categoryId,
    limit: 50,
    pages: 3,
    soldHistoryOnly: false,
  });

  const rawActive = activeResult.items;
  const rawSold = soldResult.items;

  console.log(
    `   ➜ Sold items collected: ${rawSold.length}, Active items in slot: ${rawActive.length}`,
  );

  if (rawSold.length === 0 && rawActive.length === 0) {
    console.log("   ⚠️ No data for this slot, skipping metrics row.");
    return null;
  }

  const { activeDtos, soldDtos } = MarketPipelineAdapter.getFilteredDtos(
    rawActive,
    rawSold,
    keyword,
    false,
  );

  const activeTitledPrices: TitledPrice[] = activeDtos
    .map((d) => ({ title: d.title, price: d.price }))
    .filter((d) => d.price > 0);
  const soldTitledPrices: TitledPrice[] = soldDtos
    .map((d) => ({ title: d.title, price: d.price }))
    .filter((d) => d.price > 0);

  const activeSegments = autoSegment(keyword, activeTitledPrices);
  const soldSegments = autoSegment(keyword, soldTitledPrices);

  if (activeSegments.length > 1 || soldSegments.length > 1) {
    console.log(
      `   🧩 Auto-segmentation found multiple groups in "${keyword}" — this slot is likely mixed:`,
    );
  }

  for (const seg of activeSegments) {
    console.log(
      `      [ACTIVE] ${seg.label}: ${seg.count} listings, £${seg.minPrice.toFixed(2)}-£${seg.maxPrice.toFixed(2)} (median £${seg.medianPrice.toFixed(2)})`,
    );
    console.log(`         e.g. ${seg.sampleTitles.join(" | ")}`);
    allSegmentRows.push({
      categoryId,
      slotKeyword: keyword,
      segmentLabel: seg.label,
      source: "active",
      count: seg.count,
      minPrice: seg.minPrice,
      maxPrice: seg.maxPrice,
      medianPrice: seg.medianPrice,
      sampleTitles: seg.sampleTitles,
    });
  }

  for (const seg of soldSegments) {
    console.log(
      `      [SOLD]   ${seg.label}: ${seg.count} listings, £${seg.minPrice.toFixed(2)}-£${seg.maxPrice.toFixed(2)} (median £${seg.medianPrice.toFixed(2)})`,
    );
    console.log(`         e.g. ${seg.sampleTitles.join(" | ")}`);
    allSegmentRows.push({
      categoryId,
      slotKeyword: keyword,
      segmentLabel: seg.label,
      source: "sold",
      count: seg.count,
      minPrice: seg.minPrice,
      maxPrice: seg.maxPrice,
      medianPrice: seg.medianPrice,
      sampleTitles: seg.sampleTitles,
    });
  }

  const container = MarketPipelineAdapter.processMarketData(
    rawActive,
    rawSold,
    keyword,
    false,
  );

  const filteredSold = container.soldMarketCount ?? container.soldCount;
  const filteredActive = container.activeMarketCount ?? container.activeCount;

  console.log(
    `   ➜ Sold items: ${rawSold.length} raw / ${filteredSold} filtered | Active items: ${rawActive.length} raw / ${filteredActive} filtered`,
  );

  const strFraction = computeSellThrough(filteredSold, filteredActive);
  const strPercent = strFraction * 100;

  if (filteredSold === 0) {
    console.log(
      `   ⚠️ WARNING: 0 sold comparables survived filtering (raw sold collected: ${rawSold.length}) — STR and medianSold below are UNRELIABLE, likely caused by a scraper failure rather than genuine zero demand.`,
    );
  }

  if (container.avgActivePrice <= 0 || filteredActive === 0) {
    console.log(
      `   ⚠️ WARNING: 0 active comparables survived filtering — STR and medianAsk below are unreliable for this slot.`,
    );
  }

  console.log(
    `   ➜ STR: ${strPercent.toFixed(1)}% | median sold: £${container.avgSoldPrice.toFixed(2)} | median ask: £${container.avgActivePrice.toFixed(2)}`,
  );

  return {
    categoryId,
    slotKeyword: keyword,
    soldCount: container.soldMarketCount ?? container.soldCount,
    activeCount: container.activeMarketCount ?? container.activeCount,
    strPercent,
    medianSold: container.avgSoldPrice,
    medianAsk: container.avgActivePrice,
  };
}

const EXPLORER_CATEGORY_IDS = [
  "9355",
  "112529",
  "31388",
  "171485",
  "175672",
  "178893",
];

async function main() {
  const envCategory = process.env.EBAY_CATEGORY_ID;

  const categoryIdsToExplore = envCategory
    ? [envCategory]
    : EXPLORER_CATEGORY_IDS;

  console.log(
    `🚀 Category Explorer: starting for ${categoryIdsToExplore.length} category id(s): ${categoryIdsToExplore.join(", ")}`,
  );

  for (const categoryId of categoryIdsToExplore) {
    try {
      await exploreLeafCategory(categoryId);
    } catch (err) {
      console.error(`❌ Error while exploring categoryId=${categoryId}:`, err);
    }
  }

  console.log("✅ Category Explorer run complete.");
}

main().catch((err) => {
  console.error("❌ Category explorer fatal error:", err);
  process.exit(1);
});
