/* import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { evaluateSourcingMargins } from "./marginCalculator";
import { parsePrice } from "../../scrapper/soldNormalize";

export interface WholesaleItem {
  gtin: string;
  name: string;
  brand: string;
  category: string; // ✅ Declared to eliminate 'Property does not exist' error
  wholesaleCost: number;
  packUnit: number;
  totalInventory: number;
}

export interface ScannerEvaluationResult {
  gtin: string;
  name: string;
  wholesaleCostPerUnit: number;
  maxAllowableSourcingCost: number;
  targetResalePriceFloor: number;
  marginStatus: "VIABLE" | "REJECTED";
  projectedNetProfitPerUnit: number;

  // ✅ Explicitly typed here to satisfy object-literal structural constraints
  confidenceMetrics: {
    dataConfidenceScore: number;
    sellThroughRate: number;
    soldActiveDivergence: number;
    liquidityRiskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
}

export class SupplierManifestScanner {
  public static parseManifest(csvFilePath: string): WholesaleItem[] {
    const rawCsv = fs.readFileSync(csvFilePath, "utf-8");
    const records = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((row: any): WholesaleItem => {
      const keys = Object.keys(row);
      const priceKey =
        keys.find(
          (k) =>
            k.toLowerCase().includes("price") || k.includes("Lowest Price"),
        ) || "";
      const rawPriceText = priceKey ? row[priceKey] : "0";
      const cleanPriceData = parsePrice(String(rawPriceText));

      return {
        gtin: row["GTIN"] || "UNKNOWN",
        name: row["Name"] || row["Title"] || "UNKNOWN",
        brand: row["Brand"] || "UNKNOWN",
        category: row["Category"] || row["Type"] || "UNKNOWN", // ✅ Clean programmatic extraction
        wholesaleCost: cleanPriceData ? cleanPriceData.price : 0,
        packUnit: parseInt(row["Unit"], 10) || 1,
        totalInventory: parseInt(row["Total Inventory"], 10) || 0,
      };
    });
  }

  public static evaluatePortfolio(
    items: WholesaleItem[],
    marketMatrixMap: Map<string, any>,
  ): ScannerEvaluationResult[] {
    return items.map((item): ScannerEvaluationResult => {
      const lookupKey =
        item.gtin && item.gtin !== "UNKNOWN" ? item.gtin : item.name;
      const metrics = marketMatrixMap.get(lookupKey);

      // Anchor calculation parameters tightly to our clean median-sold reality
      const targetResaleFloor =
        metrics && metrics.avgSoldPrice > 0 ? metrics.avgSoldPrice : 0;

      // -----------------------------------------------------------------
      // CATEGORY-AGNOSTIC SHIPPING LAYER: Dynamic calculation values
      // -----------------------------------------------------------------
      let customPostageFee: number | undefined = undefined;

      const isCosmeticCategory =
        (item.category && item.category.toLowerCase().includes("cosmetics")) ||
        (item.category && item.category.toLowerCase().includes("beauty")) ||
        (item.name && item.name.toLowerCase().includes("balm"));

      if (isCosmeticCategory && targetResaleFloor < 15.0) {
        customPostageFee = 1.5; // Optimized Royal Mail Large Letter postage adjustment applied cleanly
      }

      const financialAnalysis = evaluateSourcingMargins({
        targetResalePrice: targetResaleFloor,
        targetRoi: 0.2,
        postageOverride: customPostageFee,
      });

      const costPerSingleUnit = item.wholesaleCost / item.packUnit;

      const str =
        metrics && metrics.activeCount > 0
          ? metrics.soldCount / metrics.activeCount
          : 0;

      // Basic risk routing matching the auditor's request for simple thresholds
      const isViableMargin =
        targetResaleFloor > 0 &&
        costPerSingleUnit <= financialAnalysis.maxAllowableSourcingCost;
      const riskRating =
        targetResaleFloor > 0 && metrics.soldCount > 5 ? "LOW" : "CRITICAL";

      const isViable = isViableMargin && riskRating !== "CRITICAL";

      const totalOverhead =
        financialAnalysis.ebayVariableFee +
        financialAnalysis.ebayFixedFee +
        financialAnalysis.postageCost;
      const projectedNetProfitPerUnit = isViable
        ? targetResaleFloor - totalOverhead - costPerSingleUnit
        : 0;

      return {
        gtin: item.gtin,
        name: item.name,
        wholesaleCostPerUnit: costPerSingleUnit,
        maxAllowableSourcingCost: financialAnalysis.maxAllowableSourcingCost,
        targetResalePriceFloor: targetResaleFloor,
        marginStatus: isViable ? "VIABLE" : "REJECTED",
        projectedNetProfitPerUnit,
        confidenceMetrics: {
          dataConfidenceScore: 1.0,
          sellThroughRate: str,
          soldActiveDivergence:
            metrics && metrics.avgSoldPrice > 0
              ? (metrics.avgActivePrice - metrics.avgSoldPrice) /
                metrics.avgSoldPrice
              : 0,
          liquidityRiskRating: isViable ? "LOW" : "CRITICAL",
        },
      };
    });
  }
}
 */

//========================================================================================================//

/* import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { evaluateSourcingMargins } from "./marginCalculator";
import { parsePrice } from "../../scrapper/soldNormalize";
import { LogisticsEngine } from "../shipping/logisticsEngine";

export interface WholesaleItem {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  wholesaleCost: number;
  packUnit: number;
  totalInventory: number;
}

export type ManifestPricingModel = "PER_UNIT" | "PER_PACK";

export class SupplierManifestScanner {
  public static parseManifest(
    csvFilePath: string,
    model: ManifestPricingModel = "PER_UNIT",
  ): WholesaleItem[] {
    const rawCsv = fs.readFileSync(csvFilePath, "utf-8");
    const records = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((row: any): WholesaleItem => {
      const keys = Object.keys(row);

      // ✅ FUZZY HEADER MAPPING LAYER: Resolves case mismatches and hidden column spaces automatically
      const gtinKey =
        keys.find((k) => /^(gtin|ean|upc|barcode)$/i.test(k.trim())) || "";
      const nameKey =
        keys.find((k) => /^(name|title|product\s*title)$/i.test(k.trim())) ||
        "";
      const brandKey =
        keys.find((k) => /^(brand|manufacturer)$/i.test(k.trim())) || "";
      const catKey =
        keys.find((k) => /^(category|type|class)$/i.test(k.trim())) || "";
      const unitKey =
        keys.find((k) => /^(unit|pack\s*size|qty|quantity)$/i.test(k.trim())) ||
        "";
      const stockKey =
        keys.find((k) => /^(total\s*inventory|stock|avail)$/i.test(k.trim())) ||
        "";
      const priceKey =
        keys.find(
          (k) =>
            k.toLowerCase().includes("price") ||
            k.toLowerCase().includes("lowest"),
        ) || "";

      const rawPriceText = priceKey ? row[priceKey] : "0";
      const parsedPriceData = parsePrice(String(rawPriceText));
      const rawPriceValue = parsedPriceData ? parsedPriceData.price : 0;

      const packUnitSize = parseInt(row[unitKey], 10) || 1;

      let finalizedUnitCost = rawPriceValue;
      if (model === "PER_PACK" && packUnitSize > 1) {
        finalizedUnitCost = rawPriceValue / packUnitSize;
      }

      return {
        gtin: gtinKey ? String(row[gtinKey]).trim() : "UNKNOWN",
        name: nameKey ? String(row[nameKey]).trim() : "UNKNOWN",
        brand: brandKey ? String(row[brandKey]).trim() : "UNKNOWN",
        category: catKey ? String(row[catKey]).trim() : "UNKNOWN",
        wholesaleCost: finalizedUnitCost,
        packUnit: packUnitSize,
        totalInventory: parseInt(row[stockKey], 10) || 0,
      };
    });
  }

  // Add this import statement to the top of src/core/finance/manifestScanner.ts

  // Inside your SupplierManifestScanner class -> Replace evaluatePortfolio with this:
  public static evaluatePortfolio(
    items: WholesaleItem[],
    marketMatrixMap: Map<string, any>,
  ): any[] {
    return items.map((item): any => {
      const lookupKey =
        item.gtin && item.gtin !== "UNKNOWN" ? item.gtin : item.name;
      const metrics = marketMatrixMap.get(lookupKey);

      const targetResaleFloor =
        metrics && metrics.avgSoldPrice > 0 ? metrics.avgSoldPrice : 0;

      // ✅ LOGISTICS DECOUPLING PASS: Extract package specifications implicitly based on attributes
      const isLiquidOrInsuredFragile =
        item.category.toLowerCase().includes("perfume") ||
        item.name.toLowerCase().includes("spray") ||
        item.name.toLowerCase().includes("oz");

      const inferredPostageCost = LogisticsEngine.calculateInferredPostage(
        targetResaleFloor,
        {
          isLiquidOrGlass: isLiquidOrInsuredFragile,
          isFragile: isLiquidOrInsuredFragile,
        },
      );

      const financialAnalysis = evaluateSourcingMargins({
        targetResalePrice: targetResaleFloor,
        targetRoi: 0.1,
        postageOverride: inferredPostageCost, // Pass our clean inferred shipping cost out directly
      });

      const costPerSingleUnit = item.wholesaleCost;
      const str =
        metrics && metrics.activeCount > 0
          ? metrics.soldCount / metrics.activeCount
          : 0;

      const isViableMargin =
        targetResaleFloor > 0 &&
        costPerSingleUnit <= financialAnalysis.maxAllowableSourcingCost;
      const riskRating =
        targetResaleFloor > 0 && metrics.soldCount >= 2 ? "LOW" : "CRITICAL";
      const isViable = isViableMargin && riskRating !== "CRITICAL";

      const totalOverhead =
        financialAnalysis.ebayVariableFee +
        financialAnalysis.ebayFixedFee +
        financialAnalysis.postageCost;
      const projectedNetProfitPerUnit = isViable
        ? targetResaleFloor - totalOverhead - costPerSingleUnit
        : 0;

      return {
        gtin: item.gtin,
        name: item.name,
        wholesaleCostPerUnit: costPerSingleUnit,
        maxAllowableSourcingCost: financialAnalysis.maxAllowableSourcingCost,
        targetResalePriceFloor: targetResaleFloor,
        marginStatus: isViable ? "VIABLE" : "REJECTED",
        projectedNetProfitPerUnit,
        confidenceMetrics: {
          dataConfidenceScore: 1.0,
          sellThroughRate: str,
          soldActiveDivergence:
            metrics && metrics.avgSoldPrice > 0
              ? (metrics.avgActivePrice - metrics.avgSoldPrice) /
                metrics.avgSoldPrice
              : 0,
          liquidityRiskRating: isViable ? "LOW" : "CRITICAL",
        },
      };
    });
  }
}
 */

//================================================================================================================//
//================================================================================================================//

/* // src/core/finance/manifestScanner.ts
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { evaluateSourcingMargins } from "./marginCalculator";
import { parsePrice } from "../../scrapper/soldNormalize";
import { LogisticsEngine } from "../shipping/logisticsEngine";

export interface WholesaleItem {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  wholesaleCost: number;
  packUnit: number;
  totalInventory: number;
}

export type ManifestPricingModel = "PER_UNIT" | "PER_PACK";

export class SupplierManifestScanner {
  public static parseManifest(
    csvFilePath: string,
    model: ManifestPricingModel = "PER_UNIT",
  ): WholesaleItem[] {
    const rawCsv = fs.readFileSync(csvFilePath, "utf-8");
    const records = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((row: any): WholesaleItem => {
      const keys = Object.keys(row);

      const gtinKey = keys.find((k) => /^(gtin|ean|upc|barcode)$/i.test(k.trim())) || "";
      const nameKey = keys.find((k) => /^(name|title|product\s*title)$/i.test(k.trim())) || "";
      const brandKey = keys.find((k) => /^(brand|manufacturer)$/i.test(k.trim())) || "";
      const catKey = keys.find((k) => /^(category|type|class)$/i.test(k.trim())) || "";
      const unitKey = keys.find((k) => /^(unit|pack\s*size|qty|quantity)$/i.test(k.trim())) || "";
      const stockKey = keys.find((k) => /^(total\s*inventory|stock|avail)$/i.test(k.trim())) || "";
      const priceKey = keys.find((k) => k.toLowerCase().includes("price") || k.toLowerCase().includes("lowest")) || "";

      const rawPriceText = priceKey ? row[priceKey] : "0";
      const parsedPriceData = parsePrice(String(rawPriceText));
      const rawPriceValue = parsedPriceData ? parsedPriceData.price : 0;

      const packUnitSize = parseInt(row[unitKey], 10) || 1;

      let finalizedUnitCost = rawPriceValue;
      if (model === "PER_PACK" && packUnitSize > 1) {
        finalizedUnitCost = rawPriceValue / packUnitSize;
      }

      return {
        gtin: gtinKey ? String(row[gtinKey]).trim() : "UNKNOWN",
        name: nameKey ? String(row[nameKey]).trim() : "UNKNOWN",
        brand: brandKey ? String(row[brandKey]).trim() : "UNKNOWN",
        category: catKey ? String(row[catKey]).trim() : "UNKNOWN",
        wholesaleCost: finalizedUnitCost,
        packUnit: packUnitSize,
        totalInventory: parseInt(row[stockKey], 10) || 0,
      };
    });
  }

  
   //PURE CATEGORY-AGNOSTIC EVALUATION PIPELINE
   // Resolves shipping risks using purely volumetric capacity tokens and price tiers
   
  public static evaluatePortfolio(
    items: WholesaleItem[],
    marketMatrixMap: Map<string, any>,
  ): any[] {
    return items.map((item): any => {
      const lookupKey = item.gtin && item.gtin !== "UNKNOWN" ? item.gtin : item.name;
      const metrics = marketMatrixMap.get(lookupKey);

      const targetResaleFloor = metrics && metrics.avgSoldPrice > 0 ? metrics.avgSoldPrice : 0;

      // ✅ CATEGORY-AGNOSTIC VOLUMETRIC METADATA MATCHING LAYER:
      // Uses regular expressions to match any unit dimension layout tokens (ml, oz, g, kg, lbs)
      // dynamically across any target catalog type (Cosmetics, Groceries, Auto Parts, Tech)
      const parsedVolumeToken = item.name.match(/(\d+(?:\.\d+)?)\s*(ml|g|oz|kg|lbs|tb|gb)/i);
      
      let weightClassTier: "LIGHT" | "MEDIUM" | "HEAVY" = "LIGHT";
      let requiresSpecialHandling = false;

      if (parsedVolumeToken) {
        const magnitudeValue = parseFloat(parsedVolumeToken[1]);
        const dimensionUnit = parsedVolumeToken[2].toLowerCase();

        // Dynamically assign weight classes based on unit dimensions
        if ((["kg", "lbs"].includes(dimensionUnit) && magnitudeValue > 2) || 
            (["g", "ml"].includes(dimensionUnit) && magnitudeValue > 1000)) {
          weightClassTier = "HEAVY";
        } else if ((["kg", "lbs"].includes(dimensionUnit)) || 
                   (["g", "ml", "oz"].includes(dimensionUnit) && magnitudeValue > 250)) {
          weightClassTier = "MEDIUM";
        }

        // High capacity digital tracking markers or physical components (like a 1TB hard drive)
        if (["tb", "gb"].includes(dimensionUnit) && magnitudeValue >= 512) {
          requiresSpecialHandling = true; // Premium electronic shipping protection rule
        }
      }

      // ✅ VALUE-BASED CARRIER RISK ALLOCATION:
      // High-ticket items trigger tracking and insurance flags automatically, regardless of category
      if (targetResaleFloor > 75.0) {
        requiresSpecialHandling = true; 
      }

      // Route parameters down to your clean LogisticsEngine utility safely
      const inferredPostageCost = LogisticsEngine.calculateInferredPostage(
        targetResaleFloor,
        {
          weightTier: weightClassTier,
          requiresInsurance: requiresSpecialHandling
        },
      );

      const financialAnalysis = evaluateSourcingMargins({
        targetResalePrice: targetResaleFloor,
        targetRoi: 0.1, // Testing baseline 10% ROI gate modifier
        postageOverride: inferredPostageCost,
      });

      const costPerSingleUnit = item.wholesaleCost;
      const str = metrics && metrics.activeCount > 0 ? metrics.soldCount / metrics.activeCount : 0;

      const isViableMargin = targetResaleFloor > 0 && costPerSingleUnit <= financialAnalysis.maxAllowableSourcingCost;
      const riskRating = targetResaleFloor > 0 && metrics.soldCount >= 2 ? "LOW" : "CRITICAL";
      const isViable = isViableMargin && riskRating !== "CRITICAL";

      const totalOverhead =
        financialAnalysis.ebayVariableFee +
        financialAnalysis.ebayFixedFee +
        financialAnalysis.postageCost;
        
      const projectedNetProfitPerUnit = isViable ? targetResaleFloor - totalOverhead - costPerSingleUnit : 0;

      return {
        gtin: item.gtin,
        name: item.name,
        wholesaleCostPerUnit: costPerSingleUnit,
        maxAllowableSourcingCost: financialAnalysis.maxAllowableSourcingCost,
        targetResalePriceFloor: targetResaleFloor,
        marginStatus: isViable ? "VIABLE" : "REJECTED",
        projectedNetProfitPerUnit,
        confidenceMetrics: {
          dataConfidenceScore: 1.0,
          sellThroughRate: str,
          soldActiveDivergence: metrics && metrics.avgSoldPrice > 0
            ? (metrics.avgActivePrice - metrics.avgSoldPrice) / metrics.avgSoldPrice
            : 0,
          liquidityRiskRating: isViable ? "LOW" : "CRITICAL",
        },
      };
    });
  }
} */

//================================================================================================================//
//================================================================================================================//

// src/core/finance/manifestScanner.ts
import * as fs from "fs";
import { parse } from "csv-parse/sync";
import { evaluateSourcingMargins } from "./marginCalculator";
import { parsePrice } from "../../scrapper/soldNormalize";
import { LogisticsEngine } from "../shipping/logisticsEngine";
import { computePriceBias, computeSellThrough } from "./marketMetrics";

export interface WholesaleItem {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  wholesaleCost: number;
  packUnit: number;
  totalInventory: number;
}

export type ManifestPricingModel = "PER_UNIT" | "PER_PACK";

export class SupplierManifestScanner {
  /**
   * ADVANCED AGGREGATING MANIFEST PARSER
   * Group identical product models automatically, summing up warehouse volumes
   */
  public static parseManifest(
    csvFilePath: string,
    model: ManifestPricingModel = "PER_UNIT",
  ): WholesaleItem[] {
    const rawCsv = fs.readFileSync(csvFilePath, "utf-8");

    // ✅ TYPE CORRECTION: Explicitly type cast the parsed array entries as generic raw row dictionaries
    const records = parse(rawCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>;

    // Temporary map to consolidate rows by their calculated lookup signature keys
    const aggregatedMap = new Map<string, any>();

    for (const row of records) {
      // row is now cleanly inferred as Record<string, string>, unlocking Object.keys() safely!
      const keys = Object.keys(row);

      const gtinKey =
        keys.find((k) => /^(gtin|ean|upc|barcode)$/i.test(k.trim())) || "";
      const nameKey =
        keys.find((k) => /^(name|title|product\s*title)$/i.test(k.trim())) ||
        "";
      const brandKey =
        keys.find((k) => /^(brand|manufacturer)$/i.test(k.trim())) || "";
      const catKey =
        keys.find((k) => /^(category|type|class)$/i.test(k.trim())) || "";
      const unitKey =
        keys.find((k) => /^(unit|pack\s*size|qty|quantity)$/i.test(k.trim())) ||
        "";
      const stockKey =
        keys.find((k) => /^(total\s*inventory|stock|avail)$/i.test(k.trim())) ||
        "";
      const priceKey =
        keys.find(
          (k) =>
            k.toLowerCase().includes("price") ||
            k.toLowerCase().includes("lowest"),
        ) || "";

      const rawPriceText = priceKey ? row[priceKey] : "0";
      const parsedPriceData = parsePrice(String(rawPriceText));
      const rawPriceValue = parsedPriceData ? parsedPriceData.price : 0;

      const packUnitSize = parseInt(row[unitKey], 10) || 1;
      const rowQuantity = parseInt(row[stockKey], 10) || 1;

      let finalizedUnitCost = rawPriceValue;
      if (model === "PER_PACK" && packUnitSize > 1) {
        finalizedUnitCost = rawPriceValue / packUnitSize;
      }

      const gtin = gtinKey ? String(row[gtinKey]).trim() : "UNKNOWN";
      const name = nameKey ? String(row[nameKey]).trim() : "UNKNOWN";

      // Derive a unique map compilation key signature anchor
      const uniqueSignatureKey = gtin !== "UNKNOWN" ? gtin : name;

      if (aggregatedMap.has(uniqueSignatureKey)) {
        const existingRecord = aggregatedMap.get(uniqueSignatureKey);
        existingRecord.totalInventory += rowQuantity;
      } else {
        aggregatedMap.set(uniqueSignatureKey, {
          gtin,
          name,
          brand: brandKey ? String(row[brandKey]).trim() : "UNKNOWN",
          category: catKey ? String(row[catKey]).trim() : "UNKNOWN",
          wholesaleCost: finalizedUnitCost,
          packUnit: packUnitSize,
          totalInventory: rowQuantity,
        });
      }
    }

    return Array.from(aggregatedMap.values());
  }

  /**
   * PURE CATEGORY-AGNOSTIC EVALUATION PIPELINE
   */
  public static evaluatePortfolio(
    items: WholesaleItem[],
    marketMatrixMap: Map<string, any>,
  ): any[] {
    return items.map((item): any => {
      const lookupKey =
        item.gtin && item.gtin !== "UNKNOWN" ? item.gtin : item.name;
      const metrics = marketMatrixMap.get(lookupKey);

      const targetResaleFloor =
        metrics && metrics.avgSoldPrice > 0 ? metrics.avgSoldPrice : 0;

      // Extract volumetric unit measurements via regex string parsing
      const parsedVolumeToken = item.name.match(
        /(\d+(?:\.\d+)?)\s*(ml|g|oz|kg|lbs|tb|gb|w)/i,
      );

      let weightClassTier: "LIGHT" | "MEDIUM" | "HEAVY" = "LIGHT";
      let requiresSpecialHandling = false;

      if (parsedVolumeToken) {
        const magnitudeValue = parseFloat(parsedVolumeToken[1]);
        const dimensionUnit = parsedVolumeToken[2].toLowerCase();

        if (
          (["kg", "lbs"].includes(dimensionUnit) && magnitudeValue > 2) ||
          (["g", "ml", "w"].includes(dimensionUnit) && magnitudeValue > 1000)
        ) {
          weightClassTier = "HEAVY";
        } else if (
          ["kg", "lbs"].includes(dimensionUnit) ||
          (["g", "ml", "oz", "w"].includes(dimensionUnit) &&
            magnitudeValue > 250)
        ) {
          weightClassTier = "MEDIUM";
        }

        if (["tb", "gb"].includes(dimensionUnit) && magnitudeValue >= 512) {
          requiresSpecialHandling = true;
        }
      }

      if (targetResaleFloor > 75.0) {
        requiresSpecialHandling = true;
      }

      const inferredPostageCost = LogisticsEngine.calculateInferredPostage(
        targetResaleFloor,
        {
          weightTier: weightClassTier,
          requiresInsurance: requiresSpecialHandling,
        },
      );

      const financialAnalysis = evaluateSourcingMargins({
        targetResalePrice: targetResaleFloor,
        targetRoi: 0.1,
        postageOverride: inferredPostageCost,
      });

      const costPerSingleUnit = item.wholesaleCost;
      const str = metrics
        ? computeSellThrough(metrics.soldCount, metrics.activeCount)
        : 0;

      const isViableMargin =
        targetResaleFloor > 0 &&
        costPerSingleUnit <= financialAnalysis.maxAllowableSourcingCost;
      const riskRating =
        targetResaleFloor > 0 && metrics.soldCount >= 2 ? "LOW" : "CRITICAL";
      const isViable = isViableMargin && riskRating !== "CRITICAL";

      const totalOverhead =
        financialAnalysis.ebayVariableFee +
        financialAnalysis.ebayFixedFee +
        financialAnalysis.postageCost;

      const projectedNetProfitPerUnit = isViable
        ? targetResaleFloor - totalOverhead - costPerSingleUnit
        : 0;

      return {
        gtin: item.gtin,
        name: item.name,
        wholesaleCostPerUnit: costPerSingleUnit,
        maxAllowableSourcingCost: financialAnalysis.maxAllowableSourcingCost,
        targetResalePriceFloor: targetResaleFloor,
        marginStatus: isViable ? "VIABLE" : "REJECTED",
        projectedNetProfitPerUnit,
        totalLotVolumeSize: item.totalInventory,
        confidenceMetrics: {
          dataConfidenceScore: 1.0,
          sellThroughRate: str,
          soldActiveDivergence: metrics
            ? computePriceBias(metrics.avgActivePrice, metrics.avgSoldPrice)
            : 0,
          liquidityRiskRating: isViable ? "LOW" : "CRITICAL",
        },
      };
    });
  }
}
