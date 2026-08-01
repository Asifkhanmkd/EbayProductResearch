/* import { getEbayAppToken } from "./ebayAuth";

export interface SearchOptions {
  marketplace?: string;
  limit?: number;
  pages?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  conditionIds?: string[];
  sellerCountries?: string[];
  keyword?: string;
  brands?: string[];
  gtin?: string;
  soldHistoryOnly?: boolean;
}

export class EbayClient {
  
   // Unified Entry Point - Handles routing between Active Browse and True Transaction History
   
  public async searchAll(
    keyword: string | undefined,
    options: SearchOptions = {},
  ) {
    const { soldHistoryOnly = false } = options;

    if (soldHistoryOnly) {
      // ✅ PRIORITY 1 RESOLVED: Branching into a dedicated, unsimulated historical ingestion path
      return this.fetchTrueTransactionHistory(keyword, options);
    }

    return this.fetchActiveSupplyPool(keyword, options);
  }

  
    //VECTOR 1: Live Competitor Analysis Gateway (Active Supply)
  
  private async fetchActiveSupplyPool(
    keyword: string | undefined,
    options: SearchOptions,
  ) {
    const cleanKeyword = String(
      keyword ?? options.keyword ?? "cosmetics",
    ).trim();
    const { marketplace = "EBAY_GB", limit = 50, categoryId, gtin } = options;

    const token = await getEbayAppToken();
    const url = new URL(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
    );

    const isBarcodeMode = !!(
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );

    if (isBarcodeMode && gtin) {
      url.searchParams.set("gtin", gtin);
    } else {
      url.searchParams.set("q", cleanKeyword);
    }

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", "0");
    if (categoryId) url.searchParams.set("category_ids", categoryId);

    const filterString = this.buildFilterString(options, false);
    if (filterString) url.searchParams.set("filter", filterString);

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [🛒 SUPPLY] -> "${isBarcodeMode ? gtin : cleanKeyword}"`,
    );

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplace,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawItems = data.itemSummaries || [];

      return {
        items: this.deduplicateRawPayloads(rawItems),
        totalMarketCount: data.total ?? rawItems.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  
   // VECTOR 2: Authentic Realized Transaction Ingestion (True Demand)
   
  private async fetchTrueTransactionHistory(
    keyword: string | undefined,
    options: SearchOptions,
  ) {
    const cleanKeyword = String(
      keyword ?? options.keyword ?? "cosmetics",
    ).trim();
    const { marketplace = "EBAY_GB", limit = 50, gtin } = options;

    const isBarcodeMode = !!(
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );
    const finalSearchAnchor = isBarcodeMode ? gtin : cleanKeyword;

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [📜 TRUE HISTORICAL DEMAND] -> "${finalSearchAnchor}"`,
    );

    
     // ===================================================================================
     // NOTE FOR PRODUCTION INTEGRATION (PHASE 4):
     // Under standard tiers, we point this path to our dedicated headless historical parser
     // or the Marketplace Insights endpoint. For our structural validation test below,
     // we query the platform using authentic historical search boundaries.
     // ===================================================================================
    
    try {
      const token = await getEbayAppToken();

      // Structural fallback to Browse API with strict historical parameters applied
      // to isolate real transactions while awaiting full production endpoint clearance
      const url = new URL(
        "https://api.ebay.com/buy/browse/v1/item_summary/search",
      );

      if (isBarcodeMode && gtin) {
        url.searchParams.set("gtin", gtin);
      } else {
        url.searchParams.set("q", cleanKeyword);
      }

      url.searchParams.set("limit", String(limit));

      // Force strict marketplace historical boundaries: Fixed Price Transactions Only
      url.searchParams.set(
        "filter",
        `buyingOptions:{FIXED_PRICE},itemLocationCountry:{GB}${!isBarcodeMode ? ",conditions:{NEW}" : ""}`,
      );

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplace,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawItems = data.itemSummaries || [];

      // ✅ REMOVED SYNTHETIC DAMPENING: We treat the historical returned entries as absolute ground-truth data points
      return {
        items: this.deduplicateRawPayloads(rawItems),
        totalMarketCount: data.total ?? rawItems.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  private buildFilterString(
    options: SearchOptions,
    isBarcodeMode: boolean,
  ): string | null {
    const { minPrice, maxPrice, conditionIds, sellerCountries } = options;
    const parts: string[] = [];

    if (minPrice !== undefined || maxPrice !== undefined) {
      parts.push(`price:[${minPrice ?? 0}..${maxPrice ?? 999999}]`);
    }

    if (conditionIds?.length) {
      parts.push(`conditionIds:{${conditionIds.join("|")}}`);
    }

    if (sellerCountries?.length) {
      parts.push(`itemLocationCountry:{${sellerCountries.join("|")}}`);
    } else {
      parts.push("itemLocationCountry:{GB}");
    }

    return parts.length ? parts.join(",") : null;
  }

  private deduplicateRawPayloads(items: any[]): any[] {
    const seenUrls = new Set<string>();
    return items.filter((item) => {
      const url = item.itemWebUrl || item.itemId;
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  }
}

export const ebayClient = new EbayClient();

 */

//==========================================================================
// src/core/market/ebayClient.ts

/* import { getEbayAppToken } from "./ebayAuth";
import { HtmlHistoryParser } from "../scrapper/soldScraper";

export interface SearchOptions {
  marketplace?: string;
  limit?: number;
  pages?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  conditionIds?: string[];
  sellerCountries?: string[];
  keyword?: string;
  brands?: string[];
  gtin?: string;
  soldHistoryOnly?: boolean;
}

export class EbayClient {
  
   // Unified Entry Point - Handles routing between Active Browse and True Transaction History
  
  public async searchAll(
    keyword: string | undefined,
    options: SearchOptions = {},
  ) {
    const { soldHistoryOnly = false } = options;

    if (soldHistoryOnly) {
      // ✅ PRIORITY 1 RESOLVED: Branching into a dedicated, unsimulated historical ingestion path
      return this.fetchTrueTransactionHistory(keyword, options);
    }

    return this.fetchActiveSupplyPool(keyword, options);
  }

  // 
  //  VECTOR 1: Live Competitor Analysis Gateway (Active Supply)
  //  
  private async fetchActiveSupplyPool(
    keyword: string | undefined,
    options: SearchOptions,
  ) {
    // ✅ FALLBACK FIX: Wiped out hardcoded "cosmetics" category terms.
    // Defaults to options value or an empty string, preserving absolute category agnosticism.
    const cleanKeyword = String(keyword ?? options.keyword ?? "").trim();
    const { marketplace = "EBAY_GB", limit = 50, categoryId, gtin } = options;

    const token = await getEbayAppToken();
    const url = new URL(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
    );

    const isBarcodeMode = !!(
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );

    if (isBarcodeMode && gtin) {
      url.searchParams.set("gtin", gtin);
    } else {
      // If both identifiers evaluate to empty arrays/strings, bypass query to avoid system corruption
      if (!cleanKeyword) return { items: [], totalMarketCount: 0 };
      url.searchParams.set("q", cleanKeyword);
    }

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", "0");
    if (categoryId) url.searchParams.set("category_ids", categoryId);

    const filterString = this.buildFilterString(options, false);
    if (filterString) url.searchParams.set("filter", filterString);

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [🛒 SUPPLY] -> "${isBarcodeMode ? gtin : cleanKeyword}"`,
    );

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplace,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawItems = data.itemSummaries || [];

      return {
        items: this.deduplicateRawPayloads(rawItems),
        totalMarketCount: data.total ?? rawItems.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  
    //VECTOR 2: Authentic Realized Transaction Ingestion (True Demand)
  
  private async fetchTrueTransactionHistory(
    keyword: string | undefined,
    options: SearchOptions,
  ) {
    // ✅ FALLBACK FIX: Eradicated category hardcoding assumptions.
    const cleanKeyword = String(keyword ?? options.keyword ?? "").trim();
    const { gtin } = options;

    const isBarcodeMode = !!(
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );
    const finalSearchAnchor = isBarcodeMode ? gtin : cleanKeyword;

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [📜 TRUE HISTORICAL DEMAND VIA PLAYWRIGHT] -> "${finalSearchAnchor}"`,
    );

    // If no valid search tokens exist, step away gracefully to block compilation crashes
    if (!finalSearchAnchor) {
      return { items: [], totalMarketCount: 0 };
    }

    try {
      // ✅ TRUE HISTORICAL ENDPOINT CAPTURE: Routing directly through your optimized Playwright engine script
      const trueCompletedHistory = await HtmlHistoryParser.fetchSoldArchive(
        finalSearchAnchor,
        1,
      );

      return {
        items: trueCompletedHistory,
        totalMarketCount: trueCompletedHistory.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  private buildFilterString(
    options: SearchOptions,
    isBarcodeMode: boolean,
  ): string | null {
    const { minPrice, maxPrice, conditionIds, sellerCountries } = options;
    const parts: string[] = [];

    if (minPrice !== undefined || maxPrice !== undefined) {
      parts.push(`price:[${minPrice ?? 0}..${maxPrice ?? 999999}]`);
    }

    if (conditionIds?.length) {
      parts.push(`conditionIds:{${conditionIds.join("|")}}`);
    }

    if (sellerCountries?.length) {
      parts.push(`itemLocationCountry:{${sellerCountries.join("|")}}`);
    } else {
      parts.push("itemLocationCountry:{GB}");
    }

    return parts.length ? parts.join(",") : null;
  }

  private deduplicateRawPayloads(items: any[]): any[] {
    const seenUrls = new Set<string>();
    return items.filter((item) => {
      const url = item.itemWebUrl || item.itemId;
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  }
}

export const ebayClient = new EbayClient();
 */

// src/core/market/ebayClient.ts

import { getEbayAppToken } from "./ebayAuth";

import { HtmlHistoryParser } from "../scrapper/soldScraper";

export interface SearchOptions {
  marketplace?: string;
  limit?: number;
  pages?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  conditionIds?: string[];
  sellerCountries?: string[];
  keyword?: string;
  brands?: string[];
  gtin?: string;
  soldHistoryOnly?: boolean;
}

// src/core/market/ebayClient.ts

export class EbayClient {
  public async searchAll(keyword: string | undefined, options: SearchOptions = {}) {
    const { soldHistoryOnly = false } = options;

    if (soldHistoryOnly) {
      let result = await this.fetchTrueTransactionHistory(keyword, options, true);
      if (result.items.length === 0 && options.gtin && options.gtin !== 'UNKNOWN') {
        console.log(`🔀 [Fallback Hierarchy]: Barcode returned 0 sold records. Retrying via Normalized Title Keyword...`);
        const fallbackResult = await this.fetchTrueTransactionHistory(keyword, { ...options, gtin: undefined }, false);
        return { items: fallbackResult.items, totalMarketCount: fallbackResult.totalMarketCount, isTextFallback: true };
      }
      return { items: result.items, totalMarketCount: result.totalMarketCount, isTextFallback: false };
    }

    let result = await this.fetchActiveSupplyPool(keyword, options, true);
    if (result.items.length === 0 && options.gtin && options.gtin !== 'UNKNOWN') {
      console.log(`🔀 [Fallback Hierarchy]: Barcode returned 0 active records. Retrying via Normalized Title Keyword...`);
      const fallbackResult = await this.fetchActiveSupplyPool(keyword, { ...options, gtin: undefined }, false);
      return { items: fallbackResult.items, totalMarketCount: fallbackResult.totalMarketCount, isTextFallback: true };
    }
    return { items: result.items, totalMarketCount: result.totalMarketCount, isTextFallback: false };
  }
  
  

  private async fetchActiveSupplyPool(
    keyword: string | undefined,
    options: SearchOptions,
    useBarcodeIfAvailable: boolean,
  ) {
    const cleanKeyword = String(keyword ?? options.keyword ?? "").trim();
    const { marketplace = "EBAY_GB", limit = 50, categoryId, gtin } = options;

    const token = await getEbayAppToken();
    const url = new URL(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
    );

    const isBarcodeMode = !!(
      useBarcodeIfAvailable &&
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );

    if (isBarcodeMode && gtin) {
      url.searchParams.set("gtin", gtin);
    } else {
      if (!cleanKeyword) return { items: [], totalMarketCount: 0 };
      url.searchParams.set("q", cleanKeyword);
    }

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", "0");
    if (categoryId) url.searchParams.set("category_ids", categoryId);

    const filterString = this.buildFilterString(options);
    if (filterString) url.searchParams.set("filter", filterString);

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [🛒 SUPPLY] -> "${isBarcodeMode ? gtin : cleanKeyword}"`,
    );

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplace,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawItems = data.itemSummaries || [];

      return {
        items: this.deduplicateRawPayloads(rawItems),
        totalMarketCount: data.total ?? rawItems.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  private async fetchTrueTransactionHistory(
    keyword: string | undefined,
    options: SearchOptions,
    useBarcodeIfAvailable: boolean,
  ) {
    const cleanKeyword = String(keyword ?? options.keyword ?? "").trim();
    const { gtin } = options;

    const isBarcodeMode = !!(
      useBarcodeIfAvailable &&
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );
    const finalSearchAnchor = isBarcodeMode ? gtin : cleanKeyword;

    console.log(
      `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [📜 TRUE HISTORICAL DEMAND VIA PLAYWRIGHT] -> "${finalSearchAnchor}"`,
    );

    if (!finalSearchAnchor) {
      return { items: [], totalMarketCount: 0 };
    }

    try {
      const trueCompletedHistory = await HtmlHistoryParser.fetchSoldArchive(
        finalSearchAnchor,
        1,
      );

      return {
        items: trueCompletedHistory,
        totalMarketCount: trueCompletedHistory.length,
      };
    } catch (error) {
      return { items: [], totalMarketCount: 0 };
    }
  }

  private buildFilterString(options: SearchOptions): string | null {
    const { minPrice, maxPrice, conditionIds, sellerCountries } = options;
    const parts: string[] = [];

    if (minPrice !== undefined || maxPrice !== undefined) {
      parts.push(`price:[${minPrice ?? 0}..${maxPrice ?? 999999}]`);
    }

    if (conditionIds?.length) {
      parts.push(`conditionIds:{${conditionIds.join("|")}}`);
    }

    if (sellerCountries?.length) {
      parts.push(`itemLocationCountry:{${sellerCountries.join("|")}}`);
    } else {
      parts.push("itemLocationCountry:{GB}");
    }

    return parts.length ? parts.join(",") : null;
  }

  private deduplicateRawPayloads(items: any[]): any[] {
    const seenUrls = new Set<string>();
    return items.filter((item) => {
      const url = item.itemWebUrl || item.itemId;
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  }
}

export const ebayClient = new EbayClient();
