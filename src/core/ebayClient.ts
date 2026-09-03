import { getEbayAppToken } from "./ebayAuth";

import { HtmlHistoryParser } from "../scrapper/soldScraper";
import {
  MARKET_WINDOW_DAYS,
  MAX_ACTIVE_PAGES,
  MAX_SOLD_PAGES,
} from "./market/marketConfig";

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
  public async searchAll(
    keyword: string | undefined,
    options: SearchOptions = {},
  ) {
    const { soldHistoryOnly = false } = options;

    if (soldHistoryOnly) {
      let result = await this.fetchTrueTransactionHistory(
        keyword,
        options,
        true,
      );
      if (
        result.items.length === 0 &&
        options.gtin &&
        options.gtin !== "UNKNOWN"
      ) {
        console.log(
          `🔀 [Fallback Hierarchy]: Barcode returned 0 sold records. Retrying via Normalized Title Keyword...`,
        );
        const fallbackResult = await this.fetchTrueTransactionHistory(
          keyword,
          { ...options, gtin: undefined },
          false,
        );
        return {
          items: fallbackResult.items,
          totalMarketCount: fallbackResult.totalMarketCount,
          isTextFallback: true,
        };
      }
      return {
        items: result.items,
        totalMarketCount: result.totalMarketCount,
        isTextFallback: false,
      };
    }

    let result = await this.fetchActiveSupplyPool(keyword, options, true);
    if (
      result.items.length === 0 &&
      options.gtin &&
      options.gtin !== "UNKNOWN"
    ) {
      console.log(
        `🔀 [Fallback Hierarchy]: Barcode returned 0 active records. Retrying via Normalized Title Keyword...`,
      );
      const fallbackResult = await this.fetchActiveSupplyPool(
        keyword,
        { ...options, gtin: undefined },
        false,
      );
      return {
        items: fallbackResult.items,
        totalMarketCount: fallbackResult.totalMarketCount,
        isTextFallback: true,
      };
    }
    return {
      items: result.items,
      totalMarketCount: result.totalMarketCount,
      isTextFallback: false,
    };
  }

  private async fetchActiveSupplyPool(
    keyword: string | undefined,
    options: SearchOptions,
    useBarcodeIfAvailable: boolean,
  ) {
    const cleanKeyword = String(keyword ?? options.keyword ?? "").trim();
    const {
      marketplace = "EBAY_GB",
      limit = 50,
      categoryId,
      gtin,
      pages = MAX_ACTIVE_PAGES,
    } = options;
    const token = await getEbayAppToken();
    const isBarcodeMode = !!(
      useBarcodeIfAvailable &&
      gtin &&
      gtin !== "UNKNOWN" &&
      /^\d{12,14}$/.test(gtin)
    );
    const allItems: any[] = [];
    let totalMarketCount = 0;
    const pageCap = Math.max(1, pages);

    try {
      for (let pageIndex = 0; pageIndex < pageCap; pageIndex++) {
        const url = new URL(
          "https://api.ebay.com/buy/browse/v1/item_summary/search",
        );
        if (isBarcodeMode && gtin) {
          // Barcode mode: search by GTIN only
          url.searchParams.set("gtin", gtin);
        } else {
          // If we have a keyword, use it; otherwise rely on category_ids
          if (cleanKeyword) {
            url.searchParams.set("q", cleanKeyword);
          } else if (!categoryId) {
            // No keyword and no category: nothing to search on
            return { items: [], totalMarketCount: 0 };
          }
        }
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(pageIndex * limit));
        if (categoryId) url.searchParams.set("category_ids", categoryId);
        const filterString = this.buildFilterString(options);
        if (filterString) url.searchParams.set("filter", filterString);
        console.log(
          `🔍 Routing Profile: [${isBarcodeMode ? "TIER 1 BARCODE MODE" : "TIER 2 GENERIC TEXT MODE"}] [🛒 SUPPLY p${pageIndex + 1}/${pageCap}] -> "${isBarcodeMode ? gtin : cleanKeyword}"`,
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
        totalMarketCount = data.total ?? totalMarketCount ?? rawItems.length;
        allItems.push(...rawItems);
        // Stop once Browse metadata says we have covered all active results, or when eBay returns a short page.
        if (rawItems.length < limit || allItems.length >= totalMarketCount)
          break;
      }
      return {
        items: this.deduplicateRawPayloads(allItems),
        totalMarketCount: totalMarketCount || allItems.length,
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
    const { gtin, categoryId } = options;

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
        options.pages ?? MAX_SOLD_PAGES,
        MARKET_WINDOW_DAYS,
        categoryId,
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

    parts.push("buyingOptions:{FIXED_PRICE}");

    if (sellerCountries?.length) {
      parts.push(`itemLocationCountry:{${sellerCountries.join("|")}}`);
    } else {
      parts.push("itemLocationCountry:{GB}");
    }

    return parts.length ? parts.join(",") : null;
  }

  private deduplicateRawPayloads(items: any[]): any[] {
    const seenKeys = new Set<string>();
    return items.filter((item) => {
      const title = String(item.title || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const seller = item.seller?.username || "UNKNOWN";
      const price = item.price?.value
        ? Number(item.price.value).toFixed(2)
        : "0.00";
      const primaryKey = item.itemWebUrl || item.itemId;
      const relistKey = `${item.itemId || "NO_ID"}|${seller}|${title}|${price}`;
      const key = primaryKey ? `${primaryKey}|${relistKey}` : relistKey;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }
}

export const ebayClient = new EbayClient();
