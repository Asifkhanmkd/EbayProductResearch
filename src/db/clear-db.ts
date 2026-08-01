/* // clear-db.ts

import { db } from "./index";
import { listings } from "./schema";

async function clear() {
  await db.delete(listings);
  console.log("✅ Listings table cleared");
}

clear();
 */

// src/db/clear-db.ts

import { db } from "./index";
import { listings, metrics } from "./schema";

/**
 * DEVELOPMENT CACHE PURGE UTILITY
 * Evicts all transient rolling web caches to force fresh live marketplace scans
 */
async function clearTransientCache() {
  console.log(
    "🧼 [Cache Purge Engine]: Initiating deep storage flush sequence...",
  );

  try {
    // 1. Evict the raw web-scraped listing text profiles
    await db.delete(listings);
    console.log("   ✅ Transient 'listings' table cleared completely.");

    // 2. Evict the compiled metrics rows that cause the cache locks
    await db.delete(metrics);
    console.log("   ✅ Aggregate 'metrics' table cleared completely.");

    // 3. Reclaim fragmented disk space inside your local SQLite file instantly
    db.$client.prepare("VACUUM;").run();
    console.log(
      "   ✨ Native SQLite space vacuum complete. Drive sectors optimized.",
    );

    console.log(
      "\n🚀 [Cache Purge Engine]: Success! Live network access keys unlocked.",
    );
  } catch (purgeError) {
    console.error(
      "❌ [Cache Purge Engine]: Storage eviction pass aborted due to exception:",
      purgeError,
    );
  }
}

clearTransientCache();
