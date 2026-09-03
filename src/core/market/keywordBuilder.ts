import { WholesaleItem } from "../finance/manifestScanner";

export type ResearchScope = "EXACT_SKU" | "CATEGORY_FALLBACK";

export interface ResearchKeywordPlan {
  exactKeyword: string;
  categoryKeyword: string;
  scope: ResearchScope;
}

const COLOURS = new Set([
  "black",
  "white",
  "silver",
  "grey",
  "gray",
  "blue",
  "red",
  "pink",
  "green",
  "gold",
]);
const STOPWORDS = new Set([
  "new",
  "authentic",
  "original",
  "boxed",
  "retail",
  "pack",
  "of",
  "pcs",
  "pieces",
  "set",
  "lot",
  "bulk",
  "wholesale",
  "limited",
  "edition",
  "special",
  "exclusive",
]);
const CORE_NOUNS = [
  "scale",
  "straightener",
  "dryer",
  "toothbrush",
  "waterpik",
  "headphones",
  "speaker",
  "watch",
  "shaver",
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function buildResearchKeyword(
  item: Pick<WholesaleItem, "name" | "brand" | "gtin">,
): ResearchKeywordPlan {
  const tokens = tokenize(item.name).filter((token) => !STOPWORDS.has(token));
  const brand =
    item.brand && item.brand !== "UNKNOWN"
      ? item.brand.toLowerCase()
      : tokens[0];
  const modelTokens = tokens.filter((token) =>
    /^(?=.*\d)[a-z0-9.-]{2,}$/i.test(token),
  );
  const noun =
    tokens.find((token) => CORE_NOUNS.includes(token)) ??
    tokens[tokens.length - 1] ??
    "";
  const colourTokens = tokens.filter((token) => COLOURS.has(token));

  const exactParts = [brand, ...modelTokens, noun, ...colourTokens]
    .filter(Boolean)
    .filter((token, index, self) => self.indexOf(token) === index);

  const exactKeyword =
    exactParts.length >= 2
      ? exactParts.join(" ")
      : tokens.slice(0, 8).join(" ");
  const categoryKeyword =
    [brand, noun].filter(Boolean).join(" ") || tokens.slice(0, 3).join(" ");

  return {
    exactKeyword,
    categoryKeyword,
    scope: "EXACT_SKU",
  };
}
