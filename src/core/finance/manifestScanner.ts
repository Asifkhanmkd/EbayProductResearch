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
        ? computeSellThrough(
            metrics.soldMarketCount ?? metrics.soldCount,
            metrics.activeMarketCount ?? metrics.activeCount,
          )
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
