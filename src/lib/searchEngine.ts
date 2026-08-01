// src/lib/searchEngine.ts

export async function executeSemanticResilientSearch(
  fullQuery: string,
  noun: string,
  ebayClient: any,
) {
  const tokens = fullQuery.split(/\s+/);
  const brand = tokens[0];

  // 1. Build a Smart OR Query: eBay interprets commas inside parentheses as an OR search.
  // e.g., "(tresemme ultra light dc dryer,tresemme dryer)"
  const smartQuery = `(${fullQuery},${brand} ${noun})`;
  console.log(`   🔍 [Engine]: Executing Smart OR-Search: "${smartQuery}"`);

  const results = await ebayClient.searchAll(smartQuery, {
    marketplace: "EBAY_GB",
    limit: 50,
    soldHistoryOnly: false,
  });

  const rawItems = results?.items || [];

  // 2. Semantic Post-Processing Filter:
  // Programmatically reject any listing title that does not contain your core product noun.
  const filteredItems = rawItems.filter((item: any) => {
    const title = item.title.toLowerCase();
    return title.includes(noun.toLowerCase());
  });

  console.log(
    `   🛡️ [Semantic Filter]: Pruned ${rawItems.length - filteredItems.length} irrelevant items. Kept ${filteredItems.length} clean matches.`,
  );

  return {
    items: filteredItems,
    isTextFallback: results?.isTextFallback || false,
  };
}
