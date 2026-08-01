/* import { db } from "./index";
import { listings, metrics } from "./schema";
import { eq, desc } from "drizzle-orm";

// 1. Save multiple listings
export async function saveListings(listingArray: any[]) {
  if (!listingArray.length) return;

  await db.insert(listings).values(
    listingArray.map((l) => ({
      ebayItemId: l.ebayItemId,
      title: l.title,
      price: l.price,
      currency: l.currency,
      soldDate: l.soldDate,
      keyword: l.keyword,
      sellerUsername: l.sellerUsername,
      sellerFeedbackScore: l.sellerFeedbackScore,
      shippingPrice: l.shippingPrice,
      categoryId: l.categoryId,
      categoryName: l.categoryName,
    })),
  ).onConflictDoNothing; // IGNORE duplicates
}



// 2. Save metrics for a keyword
export async function saveMetrics(keyword: string, m: any) {
  await db.insert(metrics).values({
    keyword,
    soldCount30d: m.soldCount30d,
    avgSoldPrice: m.avgSoldPrice,
    minSoldPrice: m.minSoldPrice,
    maxSoldPrice: m.maxSoldPrice,
    sellerCount: m.sellerCount,
  });
}

// 3. Get listings for a keyword (by title match)// not being used by scoring engine anymore
export async function getListingsByKeyword(keyword: string) {
  return await db.select().from(listings).where(eq(listings.keyword, keyword));
}

// 4. Get latest metrics snapshot
export async function getLatestMetrics(keyword: string) {
  const rows = await db
    .select()
    .from(metrics)
    .where(eq(metrics.keyword, keyword))
    .orderBy(desc(metrics.id))
    .limit(1);

  return rows[0] || null;
}
 */

//==============================================================================================================//

// Add these exports at the bottom of your src/db/queries.ts file
/*  import { db } from "./index";
import { listings, metrics } from "./schema";
import { eq, desc, and } from "drizzle-orm";
import { CleanMarketContainer } from "../core/market/marketAdapter";


 // CACHE RETRIEVAL ENGINE
 // Checks your active metrics tables for valid, unexpired data snapshots
 


export async function getCachedMarketMetrics(
  targetStorageKey: string,
): Promise<CleanMarketContainer | null> {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Pull the single latest recorded metrics snapshot entry for this target key
  const rows = await db
    .select()
    .from(metrics)
    .where(eq(metrics.keyword, targetStorageKey))
    .orderBy(desc(metrics.id))
    .limit(1);

  const latestRecord = rows[0];
  if (!latestRecord || !latestRecord.createdAt) return null;

  // Check the expiration boundary
  const recordAgeMs = Date.now() - new Date(latestRecord.createdAt).getTime();
  if (recordAgeMs > ONE_DAY_MS) {
    return null; // Data is older than 24 hours; trigger a fresh live network crawl
  }

  // Map the table fields straight back to your CleanMarketContainer structure
  return {
    avgActivePrice: latestRecord.avgActivePrice,
    avgSoldPrice: latestRecord.avgSoldPrice,
    activeCount: latestRecord.activeCount,
    soldCount: latestRecord.soldCount30d,
    sampleDensity: latestRecord.sampleDensity,
    marketRealityAlert: false,
  };
}


 // CACHE WRITE ENGINE
 // Writes compiled execution metrics back to your sqlite tables seamlessly
 
export async function saveMarketMetricsToCache(
  targetStorageKey: string,
  cleanMetrics: CleanMarketContainer,
) {
  await db.insert(metrics).values({
    keyword: targetStorageKey,
    soldCount30d: cleanMetrics.soldCount,
    avgSoldPrice: cleanMetrics.avgSoldPrice,
    minSoldPrice: 0, // Keeps legacy column structural consistency
    maxSoldPrice: 0,
    sellerCount: 0,
    activeCount: cleanMetrics.activeCount,
    avgActivePrice: cleanMetrics.avgActivePrice,
    sampleDensity: cleanMetrics.sampleDensity,
  });
}
  */

// src/db/queries.ts
import { db } from "./index";
import { listings, metrics } from "./schema";
import { eq, desc, notInArray, and, sql } from "drizzle-orm";
import { CleanMarketContainer } from "../core/market/marketAdapter";
//import { scoringResults } from "./schema"; // Ensure scoringResults is imported at the top if not present
import { manifestLeaderboardHistory } from "./schema";

/**
 * AUTOMATED DATABASE SCHEMATIC PATCHER
 * Inspects structural properties synchronously via db.$client
 */
export async function runEmbeddedMigrations(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const columns = db.$client
        .prepare("PRAGMA table_info(metrics);")
        .all() as any[];
      const columnNames = columns.map((col: any) => col.name);

      if (!columnNames.includes("active_count")) {
        console.log(
          "🛠️ [Database Alter Engine]: Appending active_count field to metrics schema...",
        );
        db.$client
          .prepare(
            "ALTER TABLE metrics ADD COLUMN active_count INTEGER DEFAULT 0 NOT NULL;",
          )
          .run();
      }
      if (!columnNames.includes("avg_active_price")) {
        console.log(
          "🛠️ [Database Alter Engine]: Appending avg_active_price field to metrics schema...",
        );
        db.$client
          .prepare(
            "ALTER TABLE metrics ADD COLUMN avg_active_price REAL DEFAULT 0.0 NOT NULL;",
          )
          .run();
      }
      if (!columnNames.includes("sample_density")) {
        console.log(
          "🛠️ [Database Alter Engine]: Appending sample_density field to metrics schema...",
        );
        db.$client
          .prepare(
            "ALTER TABLE metrics ADD COLUMN sample_density INTEGER DEFAULT 0 NOT NULL;",
          )
          .run();
      }

      resolve();
    } catch (migrationErr) {
      console.warn(
        "⚠️ [Database Alter Engine]: Verification stepped past alter updates:",
        migrationErr,
      );
      resolve();
    }
  });
}

/**
 * HIGH-SPEED DRIZZLE CACHE LOOKUP
 */
export async function getCachedMarketMetrics(
  targetStorageKey: string,
): Promise<CleanMarketContainer | null> {
  try {
    const rows = await db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.keyword, targetStorageKey),
          sql`${metrics.createdAt} >= datetime('now', '-1 day')`, // Valid within 24 hours
        ),
      )
      .orderBy(desc(metrics.id))
      .limit(1);

    const latestRecord = rows[0];
    if (!latestRecord) return null;

    return {
      avgActivePrice: latestRecord.avgActivePrice,
      avgSoldPrice: latestRecord.avgSoldPrice,
      activeCount: latestRecord.activeCount,
      soldCount: latestRecord.soldCount30d,
      sampleDensity: latestRecord.sampleDensity,
      marketRealityAlert: false,
    };
  } catch (err) {
    return null;
  }
}

/**
 * DRIZZLE CACHE STORAGE ENGINE
 */
export async function saveMarketMetricsToCache(
  targetStorageKey: string,
  cleanMetrics: CleanMarketContainer,
) {
  if (cleanMetrics.sampleDensity === 0) return;

  try {
    await db.insert(metrics).values({
      keyword: targetStorageKey,
      soldCount30d: cleanMetrics.soldCount,
      avgSoldPrice: cleanMetrics.avgSoldPrice,
      minSoldPrice: 0,
      maxSoldPrice: 0,
      sellerCount: 0,
      activeCount: cleanMetrics.activeCount,
      avgActivePrice: cleanMetrics.avgActivePrice,
      sampleDensity: cleanMetrics.sampleDensity,
    });
  } catch (insertErr) {
    console.error(
      `❌ [Drizzle Write Error]: Insertion aborted for tracking row ${targetStorageKey}:`,
      insertErr,
    );
  }
}

/**
 * AUTOMATED PORTFOLIO PURGE AND JUNK CLEANUP
 * ✅ FIXED: Only deletes rows that are both older than 24 hours AND not on your winning portfolio leaderboard
 */
export async function purgeExpiredMarketJunk(viableGtins: string[]) {
  console.log(
    "\n🧹 [Data Audit Layer]: Running automatic database cache optimization pass...",
  );

  try {
    // 1. Delete rows older than 24 hours from the transient metrics table
    if (viableGtins.length > 0) {
      await db
        .delete(metrics)
        .where(
          and(
            sql`${metrics.createdAt} < datetime('now', '-1 day')`,
            notInArray(metrics.keyword, viableGtins),
          ),
        );
      await db
        .delete(listings)
        .where(notInArray(listings.keyword, viableGtins));
    } else {
      // If no items are viable, purge metrics logs only if they have aged past 24 hours
      await db
        .delete(metrics)
        .where(sql`${metrics.createdAt} < datetime('now', '-1 day')`);
      await db.delete(listings);
    }

    // 2. Pack disk usage spaces instantly via native better-sqlite3 execution hooks
    db.$client.prepare("VACUUM;").run();
    console.log(
      "✅ [Data Audit Layer]: Transient metrics optimization pass complete. Cache protected.",
    );
  } catch (err) {
    console.warn(
      "⚠️ [Data Audit Layer]: Purge run skipped due to active thread locks.",
    );
  }
}

/**
 * PRODUCTION DRIZZLE ARCHIVE SYNC LAYER
 * Automatically logs processed leaderboard entries directly into your permanent historical metrics database.
 */
/* export async function archiveScoringResults(
  viableTargets: any[],
): Promise<void> {
  if (viableTargets.length === 0) return;

  console.log(
    `\n💾 [Database Sync Layer]: Writing ${viableTargets.length} winning positions into "scoring_results" table...`,
  );

  for (const target of viableTargets) {
    try {
      // Calculate true individual product ROI line percentages
      const individualLineRoi =
        target.wholesaleCostPerUnit > 0
          ? (target.projectedNetProfitPerUnit / target.wholesaleCostPerUnit) *
            100
          : 0;

      // Handle the 0 active supply pool anomaly to reflect true velocity
      let finalStrMetric = target.confidenceMetrics.sellThroughRate * 100;
      if (finalStrMetric === 0 && target.targetResalePriceFloor > 0) {
        // If active competition is 0, use standard high-volume indicator flag
        finalStrMetric = 999.9;
      }
       await db
        .insert(scoringResults)
        .values({
          keyword: target.name,
          demandScore: target.confidenceMetrics.sellThroughRate * 100, // Map STR ratio scale dynamically
          competitionScore: target.projectedNetProfitPerUnit,          // Cache unit cash profit values
          profitabilityScore: target.targetResalePriceFloor,           // Cache absolute resale price floors
          overallScore: individualLineRoi,                             // Save standalone line ROI yield
        })
        .onConflictDoUpdate({
          target: [scoringResults.keyword, scoringResults.createdAt],
          set: {
            demandScore: target.confidenceMetrics.sellThroughRate * 100,
            competitionScore: target.projectedNetProfitPerUnit,
            profitabilityScore: target.targetResalePriceFloor,
            overallScore: individualLineRoi,
            updatedAt: sql`CURRENT_TIMESTAMP`
          }
        });
        
      console.log(`   ✨ Saved historical performance state for: "${target.name.slice(0, 20)}..."`);
    } catch (syncError) {
      console.error(`   ⚠️ Failed to sync history profile for row ${target.name}:`, syncError);
    }
  }
} 

      
 */

// src/db/queries.ts -> Replace the entire archiveScoringResults function with this block

/**
 * PRODUCTION DRIZZLE ARCHIVE SYNC LAYER
 * Automatically logs processed leaderboard entries directly into your permanent historical metrics database.

 */

//-----------------------------------------------------------------------------------------------------------------------------//
//-----------------------------------------------------------------------------------------------------------------------------//

export async function archiveScoringResults(
  viableTargets: any[],
): Promise<void> {
  if (viableTargets.length === 0) return;

  console.log(
    `\n💾 [Database Sync Layer]: Archiving ${viableTargets.length} winning positions into "manifest_leaderboard_history"...`,
  );

  for (const target of viableTargets) {
    try {
      // Calculate true individual product ROI line percentages
      const individualLineRoi =
        target.wholesaleCostPerUnit > 0
          ? (target.projectedNetProfitPerUnit / target.wholesaleCostPerUnit) *
            100
          : 0;

      // Handle the 0 active supply pool anomaly to reflect true velocity
      let finalStrMetric = target.confidenceMetrics.sellThroughRate * 100;
      if (finalStrMetric === 0 && target.targetResalePriceFloor > 0) {
        // If active competition is 0, use standard high-volume indicator flag
        finalStrMetric = 999.9;
      }

      await db.insert(manifestLeaderboardHistory).values({
        productName: target.name,
        marketSellThroughRate: finalStrMetric,
        netUnitProfitCash: target.projectedNetProfitPerUnit,
        realizedResaleFloor: target.targetResalePriceFloor,
        individualLineRoi: individualLineRoi,
        totalAllocatedUnits: target.totalLotVolumeSize || 1,
      });

      console.log(
        `   ✨ Archived record safely: "${target.name.slice(0, 25)}..."`,
      );
    } catch (syncError) {
      console.error(
        `   ⚠️ Failed to write to history table for ${target.name}:`,
        syncError,
      );
    }
  }
}
