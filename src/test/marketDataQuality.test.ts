import assert from "node:assert/strict";
import { EbayClient } from "../core/ebayClient";
import { buildResearchKeyword } from "../core/market/keywordBuilder";
import { MarketPipelineAdapter } from "../core/market/marketAdapter";
import { HtmlHistoryParser } from "../scrapper/soldScraper";

async function run() {
  const now = new Date("2026-08-02T00:00:00Z");
  const dates = ["Sold 3 Jul, 2026", "Sold 3 Jun, 2026", "Sold 4 Apr, 2026"];
  const within90 = dates
    .map((date) => HtmlHistoryParser.parseSoldDate(date, now))
    .filter((date): date is Date => !!date)
    .filter((date) => date >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  assert.equal(within90.length, 2);

  let browseCalls = 0;
  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string) => {
    if (String(url).includes("oauth2/token")) {
      return { ok: true, json: async () => ({ access_token: "token", expires_in: 3600 }) };
    }
    browseCalls += 1;
    const parsed = new URL(String(url));
    const offset = Number(parsed.searchParams.get("offset") || 0);
    const items = Array.from({ length: 50 }, (_, index) => ({
      itemId: `item-${offset + index}`,
      itemWebUrl: `https://www.ebay.co.uk/itm/${offset + index}`,
      title: "RENPHO smart body bluetooth scale black",
      price: { value: "20.00", currency: "GBP" },
      seller: { username: `seller-${offset + index}` },
    }));
    return { ok: true, json: async () => ({ total: 200, itemSummaries: items }) };
  };
  const active = await (new EbayClient() as any).fetchActiveSupplyPool("renpho smart body scale black", {
    marketplace: "EBAY_GB",
    limit: 50,
    pages: 4,
  }, false);
  assert.equal(active.items.length, 200);
  assert.equal(active.totalMarketCount, 200);
  assert.equal(browseCalls, 4);
  global.fetch = originalFetch;

  const plan = buildResearchKeyword({
    name: "RENPHO SMART BODY BLUETOOTH SCALE BLACK",
    brand: "RENPHO",
    gtin: "UNKNOWN",
  });
  assert.equal(plan.scope, "EXACT_SKU");
  assert.match(plan.exactKeyword, /renpho/);
  assert.match(plan.exactKeyword, /scale/);
  assert.match(plan.exactKeyword, /black/);
  assert.notEqual(plan.exactKeyword, "scale");

  const metrics = MarketPipelineAdapter.processMarketData(
    [
      { itemId: "a", title: "RENPHO smart body bluetooth scale black", price: { value: "20", currency: "GBP" } },
      { itemId: "b", title: "RENPHO smart body bluetooth scale black", price: { value: "1000", currency: "GBP" } },
    ] as any,
    [
      { itemId: "s1", title: "RENPHO smart body bluetooth scale black", price: { value: "18", currency: "GBP" } },
    ] as any,
    "RENPHO SMART BODY BLUETOOTH SCALE BLACK",
    false,
  );
  assert.equal(metrics.activeMarketCount, 2);
  assert.equal(metrics.soldMarketCount, 1);
  assert.ok((metrics.activePriceSampleCount ?? 0) <= metrics.activeMarketCount!);

  console.log("marketDataQuality tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
