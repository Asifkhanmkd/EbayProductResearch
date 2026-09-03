import fs from "fs";
import path from "path";

interface ExplorerRow {
  categoryId: string;
  slotKeyword: string;
  soldCount: number;
  activeCount: number;
  strPercent: number;
  medianSold: number;
  medianAsk: number;
}

function readExplorerCsv(filePath: string): ExplorerRow[] {
  const content = fs.readFileSync(filePath, "utf8");
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);

  const headers = headerLine.split(",");
  const idx = (name: string) => headers.indexOf(name);

  const rows: ExplorerRow[] = [];
  for (const line of lines) {
    const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // CSV-safe split
    const get = (i: number) =>
      parts[i]?.replace(/^"|"$/g, "").replace(/""/g, '"') ?? "";

    rows.push({
      categoryId: get(idx("categoryId")),
      slotKeyword: get(idx("slotKeyword")),
      soldCount: Number(get(idx("soldCount")) || 0),
      activeCount: Number(get(idx("activeCount")) || 0),
      strPercent: Number(get(idx("strPercent")) || 0),
      medianSold: Number(get(idx("medianSold")) || 0),
      medianAsk: Number(get(idx("medianAsk")) || 0),
    });
  }
  return rows;
}

function buildDiscoveredManifest(rows: ExplorerRow[]) {
  // Target columns to align roughly with supplier_manifest.csv
  const header = [
    "gtin",
    "name",
    "brand",
    "category",
    "price",
    "quantity",
    "notes",
  ].join(",");

  const lines = rows.map((row) => {
    const tokens = row.slotKeyword.toLowerCase().split(/\s+/);
    const brand = tokens[0] || "UNKNOWN";

    const name = row.slotKeyword;
    const category = row.categoryId; // later we can map ID -> human name
    const assumedCostRatio = 0.35; // e.g. assume you can source at ~35% of resale
    const price = (row.medianSold * assumedCostRatio).toFixed(2);
    const quantity = 1; // single-unit slots for now
    const notes = `STR=${row.strPercent.toFixed(
      1,
    )}%; active=${row.activeCount}; medianAsk=${row.medianAsk.toFixed(2)}`;

    const safeName = `"${name.replace(/"/g, '""')}"`;
    const safeBrand = `"${brand.replace(/"/g, '""')}"`;
    const safeCategory = `"${category.replace(/"/g, '""')}"`;
    const safeNotes = `"${notes.replace(/"/g, '""')}"`;

    return [
      "UNKNOWN", // gtin
      safeName,
      safeBrand,
      safeCategory,
      price,
      quantity,
      safeNotes,
    ].join(",");
  });

  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, "discovered_manifest.csv");
  fs.writeFileSync(filePath, [header, ...lines].join("\n"), "utf8");

  console.log(
    `📝 Wrote ${lines.length} discovered manifest rows to ${filePath}`,
  );
}

async function main() {
  const outputDir = path.join(process.cwd(), "output");
  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith("category_explorer_") && f.endsWith(".csv"));

  if (!files.length) {
    console.log("⚠️ No category_explorer_*.csv files found in output/");
    return;
  }

  console.log(`📂 Found ${files.length} explorer CSV files:`, files);

  const allRows: ExplorerRow[] = [];
  for (const file of files) {
    const fullPath = path.join(outputDir, file);
    const rows = readExplorerCsv(fullPath);
    allRows.push(...rows);
  }

  // Optional: filter out extremely low-volume slots
  const filtered = allRows.filter((row) => row.soldCount >= 10);
  console.log(
    `✅ Total slots: ${allRows.length}, kept ${filtered.length} with soldCount >= 10`,
  );

  buildDiscoveredManifest(filtered);
}

main().catch((err) => {
  console.error("❌ buildDiscoveredManifest error:", err);
  process.exit(1);
});
