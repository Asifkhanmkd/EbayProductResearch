// src/util/normalizePalletManifest.ts
import * as fs from "fs";
import * as path from "path";

// Paste the raw lines straight from the supplier webpage or text export frame layout
const RAW_MANIFEST_INPUT = `
2027775	WP 490 WATERPIK CORDLESS PLUS WHITE	£75.00	1	£75.00
2027775	WP 490 WATERPIK CORDLESS PLUS WHITE	£75.00	1	£75.00
8265988	JML FINISHING TOUCH FLAWLESS RECHARGABLE	£30.00	1	£30.00
4179102	BABYLISS ESSENTIALS RECH LADY SHAVER GV	£28.00	1	£28.00
4010515	RENPHO SMART BODY BLUETOOTH SCALE BLACK	£25.00	1	£25.00
5339082	BABYLISS TITANIUM WOW PEARL STRAIGHTENER	£25.00	1	£25.00
9383481	PHIL SMITH SALON COLLECTION STRAIGHTENER	£21.00	1	£21.00
7921175	JML FINISHING TOUCH FLAWLESS	£20.00	1	£20.00
4041986	TRESEMME ULTRA LIGHT DC DRYER GV	£15.00	1	£15.00
4041986	TRESEMME ULTRA LIGHT DC DRYER GV	£15.00	1	£15.00
4041986	TRESEMME ULTRA LIGHT DC DRYER GV	£15.00	1	£15.00
9205428	PHIL SMITH WHITE HAIR STRAIGHTENER	£14.00	1	£14.00
9328161	PHIL SMITH 2000W HAIR DRYER	£14.00	1	£14.00
9312201	PHIL SMITH WHITE TRAVEL DRYER	£12.00	1	£12.00
9312201	PHIL SMITH WHITE TRAVEL DRYER	£12.00	1	£12.00
9312201	PHIL SMITH WHITE TRAVEL DRYER	£12.00	1	£12.00
`;

/**
 * PALLET INVENTORY NORMALIZER
 * Converts irregular catalog return data dumps into pristine, uniform sourcing input schemas
 */
function buildCategoryAgnosticManifest(
  rawInput: string,
  customLotBulkCost: number,
) {
  const targetCsvPath = path.join(__dirname, "../../supplier_manifest.csv");

  // Split input text clean by row breaks
  const rows = rawInput.trim().split("\n").filter(Boolean);

  let outputLines: string[] = [];
  // Write our standard headers matching our fuzzy mapping constraints
  outputLines.push("gtin,name,brand,category,price,quantity");

  console.log(`🚀 Normalizer: Parsing ${rows.length} row items...`);

  // Dynamic weight cost distribution calculation:
  // Allocates your true acquisition layout investment across rows proportionally
  const totalLotItemsCount = rows.length;
  const uniformPerUnitSourcingCost = parseFloat(
    (customLotBulkCost / totalLotItemsCount).toFixed(2),
  );

  for (const row of rows) {
    // Split columns cleanly handling tab indicators or multiple spacing boundaries
    const columns = row
      .split(/\t| {2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (columns.length < 3) continue;

    const catalogNumber = columns[0]; // High-street layout token identifier
    let productDescription = columns[1];

    // Extract the manufacturer brand signature token dynamically (typically the first token word)
    const descriptionTokens = productDescription.split(" ");
    const inferredBrandSignature = descriptionTokens[0] || "UNKNOWN";

    // ✅ DYNAMIC TEXT CLEANING FENCE:
    // Strips out brittle store-specific catalogue codes like 'GV' to protect search queries
    productDescription = productDescription
      .replace(/\b(gv|argos|clearance)\b/i, "")
      .replace(/\s+/g, " ")
      .trim();

    // Reassemble properties back into a clean uniform comma-delimited row entry line
    const cleanCsvLine = [
      "UNKNOWN", // GTIN marker is unavailable
      `"${productDescription}"`, // Escape titles securely inside quotes
      `"${inferredBrandSignature}"`, // Inferred Manufacturer token
      "RETURNS_BATCH_LOT", // Category tag classification anchor
      uniformPerUnitSourcingCost.toFixed(2), // Proportional real cash cost basis
      "1", // Quantity per unique item line tracking index
    ].join(",");

    outputLines.push(cleanCsvLine);
  }

  fs.writeFileSync(targetCsvPath, outputLines.join("\n"), "utf-8");
  console.log(
    `✅ Success: Unified supplier file generated at:\n   👉 ${targetCsvPath}`,
  );
  console.log(
    `📊 Financial Allocation Configured: Total Pallet Price £${customLotBulkCost.toFixed(2)} split across ${totalLotItemsCount} items (~£${uniformPerUnitSourcingCost.toFixed(2)} per unit cost basis).`,
  );
}

// EXECUTE CONFIGURATION PASS:
// Assuming you purchase this entire box lot box from the liquidator for a test price of £90.00 flat
buildCategoryAgnosticManifest(RAW_MANIFEST_INPUT, 90.0);
