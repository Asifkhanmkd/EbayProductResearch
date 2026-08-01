/* import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/sqlite-core";
import { unique } from "drizzle-orm/sqlite-core";

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ebayItemId: text("ebay_item_id").notNull(),
    title: text("title").notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull(),
    soldDate: text("sold_date").notNull(),
    keyword: text("keyword").notNull(),
    sellerUsername: text("seller_username").notNull(),
    sellerFeedbackScore: integer("seller_feedback_score").notNull(),
    shippingPrice: real("shipping_price").notNull(),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ebayItemUnique: unique("unique_ebay_item").on(table.ebayItemId),
    //Indexes
    titleIdx: index("idx_listings_title").on(table.title),
    sellerIdx: index("idx_listings_seller").on(table.sellerUsername),
    categoryIdx: index("idx_listings_category").on(table.categoryId),
    soldDateIdx: index("idx_listings_sold_date").on(table.soldDate),
  }),
);

export const metrics = sqliteTable(
  "metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    soldCount30d: integer("sold_count_30d").notNull(),
    avgSoldPrice: real("avg_sold_price").notNull(),
    minSoldPrice: real("min_sold_price").notNull(),
    maxSoldPrice: real("max_sold_price").notNull(),
    sellerCount: integer("seller_count").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keywordCreatedAtUnique: unique("unique_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
    //indexes
    keywordIdx: index("idx_metrics_keyword").on(table.keyword),
    createdAtIdx: index("idx_metrics_created_at").on(table.createdAt),
  }),
);
export const scoringResults = sqliteTable(
  "scoring_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    demandScore: real("demand_score").notNull(),
    competitionScore: real("competition_score").notNull(),
    profitabilityScore: real("profitability_score").notNull(),
    overallScore: real("overall_score").notNull(),
    createdAt: text("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    keywordIdx: index("idx_scoring_results_keyword").on(table.keyword),
    overallScoreIdx: index("idx_scoring_results_overall_score").on(
      table.overallScore,
    ),
    createdAtIdx: index("idx_scoring_results_created_at").on(table.createdAt),
    uniqueKeywordCreatedAt: unique("unique_scoring_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
  }),
);
 */

//========================================================================================================//

// src/db/schema.ts
/* import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/sqlite-core";
import { unique } from "drizzle-orm/sqlite-core";

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ebayItemId: text("ebay_item_id").notNull(),
    title: text("title").notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull(),
    soldDate: text("sold_date").notNull(),
    keyword: text("keyword").notNull(),
    sellerUsername: text("seller_username").notNull(),
    sellerFeedbackScore: integer("seller_feedback_score").notNull(),
    shippingPrice: real("shipping_price").notNull(),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ebayItemUnique: unique("unique_ebay_item").on(table.ebayItemId),
    titleIdx: index("idx_listings_title").on(table.title),
    sellerIdx: index("idx_listings_seller").on(table.sellerUsername),
    categoryIdx: index("idx_listings_category").on(table.categoryId),
    soldDateIdx: index("idx_listings_sold_date").on(table.soldDate),
  }),
);

export const metrics = sqliteTable(
  "metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(), // Serves as our target storage key
    soldCount30d: integer("sold_count_30d").notNull(),
    avgSoldPrice: real("avg_sold_price").notNull(),
    minSoldPrice: real("min_sold_price").notNull(),
    maxSoldPrice: real("max_sold_price").notNull(),
    sellerCount: integer("seller_count").notNull(),
    
    // ✅ PIPELINE METRICS CACHE EXTENSIONS
    activeCount: integer("active_count").default(0).notNull(),
    avgActivePrice: real("avg_active_price").default(0.0).notNull(),
    sampleDensity: integer("sample_density").default(0).notNull(),

    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keywordCreatedAtUnique: unique("unique_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
    keywordIdx: index("idx_metrics_keyword").on(table.keyword),
    createdAtIdx: index("idx_metrics_created_at").on(table.createdAt),
  }),
);

export const scoringResults = sqliteTable(
  "scoring_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    demandScore: real("demand_score").notNull(),
    competitionScore: real("competition_score").notNull(),
    profitabilityScore: real("profitability_score").notNull(),
    overallScore: real("overall_score").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    keywordIdx: index("idx_scoring_results_keyword").on(table.keyword),
    overallScoreIdx: index("idx_scoring_results_overall_score").on(table.overallScore),
    createdAtIdx: index("idx_scoring_results_created_at").on(table.createdAt),
    uniqueKeywordCreatedAt: unique("unique_scoring_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
  }),
); */


//======================================================================================//

// src/db/schema.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/sqlite-core";
import { unique } from "drizzle-orm/sqlite-core";

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ebayItemId: text("ebay_item_id").notNull(),
    title: text("title").notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull(),
    soldDate: text("sold_date").notNull(),
    keyword: text("keyword").notNull(),
    sellerUsername: text("seller_username").notNull(),
    sellerFeedbackScore: integer("seller_feedback_score").notNull(),
    shippingPrice: real("shipping_price").notNull(),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ebayItemUnique: unique("unique_ebay_item").on(table.ebayItemId),
    titleIdx: index("idx_listings_title").on(table.title),
    sellerIdx: index("idx_listings_seller").on(table.sellerUsername),
    categoryIdx: index("idx_listings_category").on(table.categoryId),
    soldDateIdx: index("idx_listings_sold_date").on(table.soldDate),
  }),
);

export const metrics = sqliteTable(
  "metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(), // Serves as our target lookup key [cite: 17]
    soldCount30d: integer("sold_count_30d").notNull(),
    avgSoldPrice: real("avg_sold_price").notNull(),
    minSoldPrice: real("min_sold_price").notNull(),
    maxSoldPrice: real("max_sold_price").notNull(),
    sellerCount: integer("seller_count").notNull(),
    
    // ✅ CACHE INFRASTRUCTURE EXTENSIONS
    activeCount: integer("active_count").default(0).notNull(),
    avgActivePrice: real("avg_active_price").default(0.0).notNull(),
    sampleDensity: integer("sample_density").default(0).notNull(),

    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    keywordCreatedAtUnique: unique("unique_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
    keywordIdx: index("idx_metrics_keyword").on(table.keyword),
    createdAtIdx: index("idx_metrics_created_at").on(table.createdAt),
  }),
);

/* export const scoringResults = sqliteTable(
  "scoring_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    demandScore: real("demand_score").notNull(),
    competitionScore: real("competition_score").notNull(),
    profitabilityScore: real("profitability_score").notNull(),
    overallScore: real("overall_score").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    keywordIdx: index("idx_scoring_results_keyword").on(table.keyword),
    overallScoreIdx: index("idx_scoring_results_overall_score").on(table.overallScore),
    createdAtIdx: index("idx_scoring_results_created_at").on(table.createdAt),
    uniqueKeywordCreatedAt: unique("unique_scoring_keyword_created_at").on(
      table.keyword,
      table.createdAt,
    ),
  }),
); */

// src/db/schema.ts

export const manifestLeaderboardHistory = sqliteTable(
  "manifest_leaderboard_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productName: text("product_name").notNull(),
    marketSellThroughRate: real("market_str_percentage").notNull(),
    netUnitProfitCash: real("net_unit_profit_cash").notNull(),
    realizedResaleFloor: real("realized_resale_floor").notNull(),
    individualLineRoi: real("individual_line_roi_percentage").notNull(),
    totalAllocatedUnits: integer("total_allocated_units").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    productNameIdx: index("idx_manifest_history_name").on(table.productName),
    createdAtIdx: index("idx_manifest_history_created_at").on(table.createdAt),
  }),
);