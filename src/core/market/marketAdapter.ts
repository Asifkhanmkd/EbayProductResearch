// src/core/market/marketAdapter.ts

import { ActiveDto, RawActivePayload } from './activeDto';
import { SoldDto, RawSoldPayload } from './soldDto';

export interface CleanMarketContainer {
  avgActivePrice: number;
  avgSoldPrice: number;
  activeCount: number;
  soldCount: number;
  activeMarketCount?: number;
  soldMarketCount?: number;
  activePriceSampleCount?: number;
  soldPriceSampleCount?: number;
  sampleDensity: number;
  marketRealityAlert: boolean;
}

export class MarketPipelineAdapter {
  
  private static suppressOutliersAdaptive(prices: number[]): number[] {
    if (prices.length < 4) return prices; 
    const sorted = [...prices].sort((a, b) => a - b);
    
    const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sorted.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (standardDeviation / mean) : 0;

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    
    const dynamicMultiplier = coefficientOfVariation > 0.35 ? 0.75 : 1.5;
    return sorted.filter(p => p >= (q1 - dynamicMultiplier * iqr) && p <= (q3 + dynamicMultiplier * iqr));
  }

  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Extract purely numeric and unit signatures (e.g., "50ml", "2.47", "50g")
   */
  private static extractNumericSignatures(text: string): string[] {
    const lower = text.toLowerCase();
    // Matches quantities, capacities, weights, and sizes agnostically
    const pattern = /\b\d+(?:\.\d+)?\s*(?:ml|g|oz|kg|v|pcs|pieces|ml)?\b/g;
    const matches = lower.match(pattern) || [];
    return matches.map(m => m.replace(/\s+/g, ''));
  }

  private static calculateIntersectionRatio(manifestName: string, scrapedName: string): number {
    const sanitize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const manifestTokens = new Set(sanitize(manifestName));
    const scrapedTokens = sanitize(scrapedName);
    
    if (manifestTokens.size === 0 || scrapedTokens.length === 0) return 0;
    
    let intersectionCount = 0;
    scrapedTokens.forEach(token => {
      if (manifestTokens.has(token)) intersectionCount++;
    });

    return intersectionCount / Math.min(manifestTokens.size, scrapedTokens.length);
  }

  /**
   * RECONCILED INGESTION PIPELINE (100% CATEGORY AGNOSTIC + QUANTITATIVE LOCK)
   */
  public static processMarketData(
    rawActive: RawActivePayload[],
    rawSold: RawSoldPayload[],
    manifestOriginalName?: string,
    isBarcodeMode: boolean = false
  ): CleanMarketContainer {
    
    let activeDtos = rawActive.map(item => new ActiveDto(item));
    let soldDtos = rawSold.map(item => new SoldDto(item));

    // ✅ CATEGORY-AGNOSTIC NUMERIC SIGNATURE LOCK
    if (!isBarcodeMode && manifestOriginalName) {
      const manifestSignatures = this.extractNumericSignatures(manifestOriginalName);

      if (manifestSignatures.length > 0) {
        // Enforce that the scraped title must contain the primary numeric metrics listed in your manifest row
        const filterBySignature = (title: string) => {
          const scrapedSignatures = this.extractNumericSignatures(title);
          return manifestSignatures.some(sig => scrapedSignatures.includes(sig));
        };

        activeDtos = activeDtos.filter(dto => filterBySignature(dto.title));
        soldDtos = soldDtos.filter(dto => filterBySignature(dto.title));
      }

      // Secondary token string match layer
      const MATCH_THRESHOLD = 0.65;
      activeDtos = activeDtos.filter(dto => this.calculateIntersectionRatio(manifestOriginalName, dto.title) >= MATCH_THRESHOLD);
      soldDtos = soldDtos.filter(dto => this.calculateIntersectionRatio(manifestOriginalName, dto.title) >= MATCH_THRESHOLD);
    }

    const rawActivePrices = activeDtos.map(d => {
      const activeShipping = d.price > 0 ? (d as unknown as { shippingPrice?: number; shippingCost?: number }) : {};
      const postageCost = activeShipping.shippingPrice ?? activeShipping.shippingCost ?? 0;
      return d.price + postageCost;
    }).filter(p => p > 0);
    
    const rawSoldPrices = soldDtos.map(d => d.price + d.shippingCost).filter(p => p > 0);

    const cleanActivePrices = this.suppressOutliersAdaptive(rawActivePrices);
    const cleanSoldPrices = this.suppressOutliersAdaptive(rawSoldPrices);
    const activeMarketCount = activeDtos.length;
    const soldMarketCount = soldDtos.length;
    const activePriceSampleCount = cleanActivePrices.length;
    const soldPriceSampleCount = cleanSoldPrices.length;

    return {
      avgActivePrice: this.calculateMedian(cleanActivePrices),
      avgSoldPrice: this.calculateMedian(cleanSoldPrices),
      activeCount: activeMarketCount,
      soldCount: soldMarketCount,
      activeMarketCount,
      soldMarketCount,
      activePriceSampleCount,
      soldPriceSampleCount,
      sampleDensity: activePriceSampleCount + soldPriceSampleCount,
      marketRealityAlert: false
    };
  }
}


 /*  // src/core/market/marketAdapter.ts

import { ActiveDto, RawActivePayload } from './activeDto';
import { SoldDto, RawSoldPayload } from './soldDto';

export interface CleanMarketContainer {
  avgActivePrice: number; 
  avgSoldPrice: number;   
  activeCount: number;
  soldCount: number;
  sampleDensity: number;
  marketRealityAlert: boolean;
}

export class MarketPipelineAdapter {
  
  private static suppressOutliersAdaptive(prices: number[]): number[] {
    if (prices.length < 4) return prices; 
    const sorted = [...prices].sort((a, b) => a - b);
    
    const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sorted.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (standardDeviation / mean) : 0;

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    
    const dynamicMultiplier = coefficientOfVariation > 0.35 ? 0.75 : 1.5;
    return sorted.filter(p => p >= (q1 - dynamicMultiplier * iqr) && p <= (q3 + dynamicMultiplier * iqr));
  }

  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // 
  //   Pure Category-Agnostic Semantic Token Intersection Evaluator
  // 
  private static calculateIntersectionRatio(manifestName: string, scrapedName: string): number {
    const sanitize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    
    const manifestTokens = new Set(sanitize(manifestName));
    const scrapedTokens = sanitize(scrapedName);
    
    if (manifestTokens.size === 0 || scrapedTokens.length === 0) return 0;
    
    let intersectionCount = 0;
    scrapedTokens.forEach(token => {
      if (manifestTokens.has(token)) {
        intersectionCount++;
      }
    });

    // Ratio of matched tokens relative to the total length of the shorter string
    return intersectionCount / Math.min(manifestTokens.size, scrapedTokens.length);
  }

  // 
  //  * RECONCILED INGESTION PIPELINE (100% CATEGORY AGNOSTIC)
  //  
  public static processMarketData(
    rawActive: RawActivePayload[],
    rawSold: RawSoldPayload[],
    manifestOriginalName?: string,
    isBarcodeMode: boolean = false
  ): CleanMarketContainer {
    
    let activeDtos = rawActive.map(item => new ActiveDto(item));
    let soldDtos = rawSold.map(item => new SoldDto(item));

    // ✅ CATEGORY-AGNOSTIC SEMANTIC GUARD: Only applied during Tier 2 Text Fallbacks
    if (!isBarcodeMode && manifestOriginalName) {
      const MATCH_THRESHOLD = 0.70; // Must clear 70% structural identity token correlation
      
      activeDtos = activeDtos.filter(dto => 
        this.calculateIntersectionRatio(manifestOriginalName, dto.title) >= MATCH_THRESHOLD
      );
      soldDtos = soldDtos.filter(dto => 
        this.calculateIntersectionRatio(manifestOriginalName, dto.title) >= MATCH_THRESHOLD
      );
    }

    const rawActivePrices = activeDtos.map(d => {
      const activeShipping = d.price > 0 ? (d as unknown as { shippingPrice?: number; shippingCost?: number }) : {};
      const postageCost = activeShipping.shippingPrice ?? activeShipping.shippingCost ?? 0;
      return d.price + postageCost;
    }).filter(p => p > 0);
    
    const rawSoldPrices = soldDtos.map(d => d.price + d.shippingCost).filter(p => p > 0);

    const cleanActivePrices = this.suppressOutliersAdaptive(rawActivePrices);
    const cleanSoldPrices = this.suppressOutliersAdaptive(rawSoldPrices);

    return {
      avgActivePrice: this.calculateMedian(cleanActivePrices),
      avgSoldPrice: this.calculateMedian(cleanSoldPrices),
      activeCount: cleanActivePrices.length,
      soldCount: cleanSoldPrices.length,
      sampleDensity: cleanActivePrices.length + cleanSoldPrices.length,
      marketRealityAlert: false
    };
  }
} */