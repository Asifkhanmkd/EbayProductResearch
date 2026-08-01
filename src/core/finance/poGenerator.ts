// src/core/finance/poGenerator.ts
import * as fs from "fs";
import * as path from "path";

export interface POItemInput {
  name: string;
  gtin: string;
  wholesaleCostPerUnit: number;
  targetResalePriceFloor: number;
  projectedNetProfitPerUnit: number;
  totalLotVolumeSize: number;
}

export class PurchaseOrderGenerator {
  /**
   * EXPORTS FORMATTED PROFESSIONAL PURCHASE ORDERS
   * Reads passing leaderboard data and maps out financial capital allocation profiles
   */
  public static generatePO(viableTargets: POItemInput[]): void {
    const targetPath = path.join(
      __dirname,
      "../../../active_purchase_order.csv",
    );

    let csvLines: string[] = [];

    // Formatted B2B Corporate Headers
    csvLines.push(
      [
        "Product Name",
        "Identifier (GTIN/Name)",
        "Unit Sourcing Cost",
        "Target Resale Floor",
        "Unit Net Cash Profit",
        "Total Allocated Units",
        "Total Sourcing Investment",
        "Total Expected Net Profit",
        "Projected Line ROI (%)",
      ].join(","),
    );

    let totalInvestmentOutlay = 0;
    let totalProjectedNetReturns = 0;
    let totalPhysicalUnitsCount = 0;

    for (const item of viableTargets) {
      const quantity = item.totalLotVolumeSize;
      const lineCostOutlay = item.wholesaleCostPerUnit * quantity;
      const lineNetProfit = item.projectedNetProfitPerUnit * quantity;
      const trueLineRoi =
        item.wholesaleCostPerUnit > 0
          ? (
              (item.projectedNetProfitPerUnit / item.wholesaleCostPerUnit) *
              100
            ).toFixed(1)
          : "0.0";

      totalInvestmentOutlay += lineCostOutlay;
      totalProjectedNetReturns += lineNetProfit;
      totalPhysicalUnitsCount += quantity;

      const cleanLine = [
        `"${item.name.replace(/"/g, '""')}"`,
        `"${item.gtin !== "UNKNOWN" ? item.gtin : "TEXT_ANCHOR"}"`,
        `£${item.wholesaleCostPerUnit.toFixed(2)}`,
        `£${item.targetResalePriceFloor.toFixed(2)}`,
        `£${item.projectedNetProfitPerUnit.toFixed(2)}`,
        quantity,
        `£${lineCostOutlay.toFixed(2)}`,
        `£${lineNetProfit.toFixed(2)}`,
        `${trueLineRoi}%`,
      ].join(",");

      csvLines.push(cleanLine);
    }

    // Append Proportional Portfolio Accumulation Summary Rows
    csvLines.push("\n");
    csvLines.push("=== PORTFOLIO RUN OVERVIEW SUMMARY ===");
    csvLines.push(`Total Physical Pallet Units,${totalPhysicalUnitsCount}`);
    csvLines.push(
      `Total Sourcing Capital Required,£${totalInvestmentOutlay.toFixed(2)}`,
    );
    csvLines.push(
      `Total Projected Net Cash Profits,£${totalProjectedNetReturns.toFixed(2)}`,
    );

    const macroBlendedRoi =
      totalInvestmentOutlay > 0
        ? ((totalProjectedNetReturns / totalInvestmentOutlay) * 100).toFixed(1)
        : "0.0";
    csvLines.push(`Blended Batch Sourcing ROI,${macroBlendedRoi}%`);

    fs.writeFileSync(targetPath, csvLines.join("\n"), "utf-8");

    console.log(
      "\n==================================================================",
    );
    console.log(`📊 [CSV PO EXPORTER]: Document generated successfully!`);
    console.log(`   👉 Location: ${targetPath}`);
    console.log(
      `   📈 Total Capital Outlay: £${totalInvestmentOutlay.toFixed(2)} | Net Cash Gain: +£${totalProjectedNetReturns.toFixed(2)}`,
    );
    console.log(
      "==================================================================",
    );
  }
}
