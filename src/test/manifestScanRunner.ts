import * as path from "path";
import * as fs from "fs";
import {
  SupplierManifestScanner,
  WholesaleItem,
} from "../core/finance/manifestScanner";
import { MarketPipelineAdapter } from "../core/market/marketAdapter";
import { ebayClient } from "../core/ebayClient";
import { HtmlHistoryParser } from "../scrapper/soldScraper";
import { PurchaseOrderGenerator } from "../core/finance/poGenerator";
import { buildResearchKeyword } from "../core/market/keywordBuilder";

import {
  runEmbeddedMigrations,
  getCachedMarketMetrics,
  saveMarketMetricsToCache,
  purgeExpiredMarketJunk,
  archiveScoringResults,
} from "../db/queries";

const GLOBAL_NOISE_MODIFIERS = new Set([
  "pack",
  "of",
  "pcs",
  "pieces",
  "box",
  "set",
  "lot",
  "bulk",
  "wholesale",
  "limited",
  "edition",
  "special",
  "exclusive",
  "new",
  "authentic",
  "original",
]);

const MAX_CONCURRENT_WORKERS = 2;

async function runUnifiedPortfolioScan() {
  const csvPath = path.join(__dirname, "../../supplier_manifest.csv");
  const rejectJsonPath = path.join(
    __dirname,
    "../../rejected_manifest_records.json",
  );

  console.log("=================================================");
  console.log("🚀 INITIALIZING PHASE 3: REAL DATA EQUILIBRIUM");
  console.log("=================================================");

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: Cannot find supplier CSV at ${csvPath}`);
    return;
  }

  // ✅ Step 1: Run table structural alignments and spin browser background frameworks
  await runEmbeddedMigrations();
  await HtmlHistoryParser.initializeSharedEngine();

  // ✅ Step 2: Parse raw supplier sheets (Single block scope declaration)
  const supplierItems: WholesaleItem[] = SupplierManifestScanner.parseManifest(
    csvPath,
    "PER_UNIT",
  );
  console.log(
    `✅ Base Pipeline: Ingested ${supplierItems.length} entries from manifest spreadsheet.`,
  );

  const marketRealityMap = new Map<string, any>();
  const executionStartTime = Date.now();

  try {
    const workerPool = async (items: WholesaleItem[]) => {
      const queue = [...items];

      const executeWorkerThread = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          const targetStorageKey =
            item.gtin && item.gtin !== "UNKNOWN" ? item.gtin : item.name;

          // Secure Asynchronous Database Cache Verification Pass
          const cachedMetrics = await getCachedMarketMetrics(targetStorageKey);
          if (cachedMetrics) {
            console.log(
              `   ⚡ [Database Cache HIT]: Extracted pristine data from "metrics" table for: "${targetStorageKey.slice(0, 15)}..."`,
            );
            marketRealityMap.set(targetStorageKey, cachedMetrics);
            continue;
          }

          const keywordPlan = buildResearchKeyword(item);
          const queryKeyword = keywordPlan.exactKeyword;

          try {
            console.log(
              `\n🔍 [Worker Task Assigned]: Processing "${item.name.slice(0, 32)}..."`,
            );
            console.log(
              `   🌐 [Cache MISS]: Sourcing insights from live marketplace networks...`,
            );

            /* 
             const [activeSearch, completedSearch] = await Promise.all([
              ebayClient.searchAll(queryKeyword, {
                marketplace: "EBAY_GB",
                limit: 50,
                pages: 1,
                gtin: item.gtin !== "UNKNOWN" ? item.gtin : undefined,
                soldHistoryOnly: false,
              }),
              ebayClient.searchAll(queryKeyword, {
                marketplace: "EBAY_GB",
                limit: 50,
                pages: 1,
                gtin: item.gtin !== "UNKNOWN" ? item.gtin : undefined,
                soldHistoryOnly: true,
              }),
            ]);

            let rawActiveItems = activeSearch?.items || [];
            const rawSoldItems = completedSearch?.items || [];

            let triggeredTextFallback = !!(
              activeSearch?.isTextFallback || completedSearch?.isTextFallback
            );

            // ==================================================================
            // 🛡️ API RESILIENCE LAYER: LOOSE KEYWORD FALLBACK PASSTHROUGH
            // ==================================================================
            if (rawActiveItems.length === 0 && rawSoldItems.length > 0) {
              // Create an isolated, immutable block-level copy of the keyword for this thread
              const isolatedThreadQuery = String(queryKeyword);
              console.log(
                `   ⚠️ [API Catalog Restriction]: 0 active items returned for strict query. Retrying loose keyword fallback...`,
              );

              const looseActiveSearch = await ebayClient.searchAll(
                queryKeyword,
                {
                  marketplace: "EBAY_GB",
                  limit: 50,
                  pages: 1,
                  soldHistoryOnly: false, // Discards strict catalog parameters
                },
              );

              rawActiveItems = looseActiveSearch?.items || [];
              if (looseActiveSearch?.isTextFallback) {
                triggeredTextFallback = true;
              }
            }
            // ==================================================================

            const cleanMetrics = MarketPipelineAdapter.processMarketData(
              rawActiveItems,
              rawSoldItems,
              item.name,
              !triggeredTextFallback,
            ); */

            // 1. Separate the execution lines so active search conditions don't rely on sold scraper speed
            const activeSearch = await ebayClient.searchAll(queryKeyword, {
              marketplace: "EBAY_GB",
              limit: 50,
              pages: 1,
              gtin: item.gtin !== "UNKNOWN" ? item.gtin : undefined,
              soldHistoryOnly: false,
            });

            // Fire historical demand in the background smoothly
            const completedSearchPromise = ebayClient.searchAll(queryKeyword, {
              marketplace: "EBAY_GB",
              limit: 50,
              pages: 1,
              gtin: item.gtin !== "UNKNOWN" ? item.gtin : undefined,
              soldHistoryOnly: true,
            });

            let rawActiveItems = activeSearch?.items || [];
            let triggeredTextFallback = !!activeSearch?.isTextFallback;

            // ==================================================================
            // 🛡️ API RESILIENCE LAYER: INDEPENDENT FALLBACK TRIGGER
            // ==================================================================
            /* if (rawActiveItems.length === 0) {
              const isolatedThreadQuery = String(queryKeyword);

              console.log(
                `   ⚠️ [API Catalog Restriction]: 0 active items returned for strict query. Retrying loose keyword fallback for: "${isolatedThreadQuery.slice(0, 22)}..."`,
              );

              const looseActiveSearch = await ebayClient.searchAll(
                isolatedThreadQuery,
                {
                  marketplace: "EBAY_GB",
                  limit: 50,
                  pages: 1,
                  soldHistoryOnly: false,
                },
              );

              rawActiveItems = looseActiveSearch?.items || [];
              if (looseActiveSearch?.isTextFallback) {
                triggeredTextFallback = true;
              }
            } */

            // ==================================================================
            // 🛡️ CATEGORY FALLBACK POLICY
            // ==================================================================
            // Do not widen exact-SKU sourcing metrics to generic category searches.
            // If exact sold and active are both empty, categoryKeyword can be used for
            // exploratory research elsewhere, but not for per-SKU leaderboard STR/profit.
            // ==================================================================

            // 2. Await your background sold history entries here before processing data metrics
            const completedSearch = await completedSearchPromise;
            const rawSoldItems = completedSearch?.items || [];

            if (completedSearch?.isTextFallback) {
              triggeredTextFallback = true;
            }

            const cleanMetrics = MarketPipelineAdapter.processMarketData(
              rawActiveItems,
              rawSoldItems,
              item.name,
              !triggeredTextFallback,
            );

            console.log(
              `   ├── [Results Collected]: "${item.name.slice(0, 20)}..."`,
            );
            console.log(
              `   │   ├── Active Pool (market): ${cleanMetrics.activeMarketCount ?? cleanMetrics.activeCount} listings, price samples: ${cleanMetrics.activePriceSampleCount ?? cleanMetrics.activeCount}. Median Asking: £${cleanMetrics.avgActivePrice.toFixed(2)}`,
            );
            console.log(
              `   │   └── Realized Sales (market): ${cleanMetrics.soldMarketCount ?? cleanMetrics.soldCount} sales, price samples: ${cleanMetrics.soldPriceSampleCount ?? cleanMetrics.soldCount}. Median Realized: £${cleanMetrics.avgSoldPrice.toFixed(2)}`,
            );

            // Persist metrics back to your live metrics table
            await saveMarketMetricsToCache(targetStorageKey, cleanMetrics);

            marketRealityMap.set(targetStorageKey, cleanMetrics);
          } catch (error) {
            console.warn(
              `   ⚠️ [Worker Thread Exception]: Skipped row processing due to context exceptions.`,
            );
            marketRealityMap.set(targetStorageKey, {
              avgActivePrice: 0,
              avgSoldPrice: 0,
              activeCount: 0,
              soldCount: 0,
              sampleDensity: 0,
              marketRealityAlert: false,
            });
          }
        }
      };

      const threads = Array(Math.min(MAX_CONCURRENT_WORKERS, items.length))
        .fill(null)
        .map(() => executeWorkerThread());

      await Promise.all(threads);
    };

    await workerPool(supplierItems);
  } finally {
    // Gracefully unmount chromium allocations
    await HtmlHistoryParser.closeSharedEngine();
  }

  const durationSeconds = ((Date.now() - executionStartTime) / 1000).toFixed(1);
  console.log(
    `\n⏱️ [Execution Complete]: Processed ${supplierItems.length} portfolio rows in ${durationSeconds} seconds.`,
  );

  console.log("\n📊 Running financial margin verification...");

  const compatibleMetricsMap = new Map();
  marketRealityMap.forEach((v, k) => {
    compatibleMetricsMap.set(k, {
      avgActivePrice: v.avgActivePrice,
      avgSoldPrice: v.avgSoldPrice,
      activeCount: v.activeCount,
      soldCount: v.soldCount,
      activeMarketCount: v.activeMarketCount ?? v.activeCount,
      soldMarketCount: v.soldMarketCount ?? v.soldCount,
      activePriceSampleCount: v.activePriceSampleCount ?? v.activeCount,
      soldPriceSampleCount: v.soldPriceSampleCount ?? v.soldCount,
      sampleDensity: v.sampleDensity,
      priceVolatility: 0,
    });
  });

  const evaluationResults = SupplierManifestScanner.evaluatePortfolio(
    supplierItems,
    compatibleMetricsMap,
  );
  const viableTargets = evaluationResults
    .filter((res) => res.marginStatus === "VIABLE")
    .sort((a, b) => b.projectedNetProfitPerUnit - a.projectedNetProfitPerUnit);

  const rejectedRecords = evaluationResults
    .filter((res) => res.marginStatus === "REJECTED")
    .map((res) => {
      const originalMetrics = marketRealityMap.get(
        res.gtin && res.gtin !== "UNKNOWN" ? res.gtin : res.name,
      );
      let rejectionReason = "UNKNOWN_PIPELINE_ERROR";
      if (!originalMetrics || originalMetrics.sampleDensity === 0) {
        rejectionReason = "ZERO_MARKET_DATA_SAMPLES_FOUND";
      } else if (res.wholesaleCostPerUnit > res.maxAllowableSourcingCost) {
        rejectionReason = `MARGIN_COMPRESSION: Cost (£${res.wholesaleCostPerUnit.toFixed(2)}) exceeds MASC ceiling (£${res.maxAllowableSourcingCost.toFixed(2)})`;
      } else if (originalMetrics.soldCount <= 3) {
        rejectionReason = `LIQUIDITY_FAILURE: Sales velocity pool too cold (${originalMetrics.soldCount} solds)`;
      }

      return {
        timestamp: new Date().toISOString(),
        gtin: res.gtin,
        name: res.name,
        wholesaleCostPerUnit: res.wholesaleCostPerUnit,
        maxAllowableSourcingCost: res.maxAllowableSourcingCost,
        targetResalePriceFloor: res.targetResalePriceFloor,
        reason: rejectionReason,
        extractedMarketMetrics: originalMetrics
          ? {
              medianActiveAskingPrice: originalMetrics.avgActivePrice,
              medianRealizedSoldPrice: originalMetrics.avgSoldPrice,
              liveActiveCompetitorCount: originalMetrics.activeMarketCount ?? originalMetrics.activeCount,
              historicalTransactionsCollected: originalMetrics.soldMarketCount ?? originalMetrics.soldCount,
              activePriceSamples: originalMetrics.activePriceSampleCount ?? originalMetrics.activeCount,
              soldPriceSamples: originalMetrics.soldPriceSampleCount ?? originalMetrics.soldCount,
            }
          : null,
      };
    });

  try {
    fs.writeFileSync(
      rejectJsonPath,
      JSON.stringify(rejectedRecords, null, 2),
      "utf-8",
    );
    console.log(
      `\n💾 [Data Audit Layer]: Archived ${rejectedRecords.length} rejected positions into:\n   👉 ${rejectJsonPath}`,
    );
  } catch (writeError) {
    console.error(`⚠️ Failed to write rejection log:`, writeError);
  }

  console.log(
    "\n==================================================================",
  );
  console.log("🏆 RECONCILED SOURCING LEADERBOARD: REALITY-ANCHORED VIABILITY");
  console.log(
    "==================================================================",
  );

  if (viableTargets.length === 0) {
    console.log(
      "❌ ZERO VIABLE DEPLOYMENTS: No manifest items cleared your risk-adjusted metrics.",
    );
  } else {
    viableTargets.forEach((target, index) => {
      const originalMetrics = marketRealityMap.get(
        target.gtin && target.gtin !== "UNKNOWN" ? target.gtin : target.name,
      );

      console.log(`
🔥 RANK [${index + 1}] : ${target.name}
   ├── Identifier Key:  ${target.gtin}
   ├── Wholesale Cost:  £${target.wholesaleCostPerUnit.toFixed(2)} per unit
   ├── Realized Value:  £${target.targetResalePriceFloor.toFixed(2)} (Anchored Sourcing Base)
   ├── Max Buy Ceiling: £${target.maxAllowableSourcingCost.toFixed(2)} (MASC Safety Ceiling)
   ├── PROGRAMMATIC CASH: £${target.projectedNetProfitPerUnit.toFixed(2)} net profit cash/unit
   └── STABILITY METRICS:
       ├── Data Density:     [${originalMetrics.sampleDensity} clean price samples]
       ├── Sell-Through Vol: [${originalMetrics.soldMarketCount ?? originalMetrics.soldCount} market sales]
       ├── Live Market STR:  [${(target.confidenceMetrics.sellThroughRate * 100).toFixed(1)}%] STR
       ├── Value Price Bias: [${(target.confidenceMetrics.soldActiveDivergence * 100).toFixed(1)}%] Asking Premium
       └── LIQUIDITY RISK:   ✨ ${target.confidenceMetrics.liquidityRiskRating} RISK ALLOCATION`);
    });
  }
  console.log(
    "\n==================================================================",
  );

  // ==================================================================
  // ✅ PLACE THE GENERATOR CALL SAFELY HERE (AFTER INITIALIZATION)
  // ==================================================================
  if (viableTargets.length > 0) {
    PurchaseOrderGenerator.generatePO(viableTargets);
    // ==================================================================
    // ⚡ NEW PERSISTENCE PASSTHROUGH LAYER
    // ==================================================================
    await archiveScoringResults(viableTargets);
  }

  // Compile active winning portfolio identifiers to isolate from the automatic cleanup pass
  const winningIdentifiers = viableTargets.map((target) =>
    target.gtin && target.gtin !== "UNKNOWN" ? target.gtin : target.name,
  );

  // Run the data optimization purge to protect disk real estate
  await purgeExpiredMarketJunk(winningIdentifiers);
}

runUnifiedPortfolioScan();
