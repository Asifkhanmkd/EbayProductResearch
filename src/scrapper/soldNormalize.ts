/* // ==========================================
// TYPES & INTERFACES
// ==========================================

export interface RawSoldItem {
  title?: string | null;
  priceText?: string | null;
  soldDateText?: string | null;
  sellerText?: string | null;
  shippingText?: string | null;
  url?: string | null;
}

export interface NormalizedListing {
  ebayItemId: string;
  title: string;
  price: number;
  currency: string;
  soldDate: string; // ISO string
  keyword: string;
  sellerUsername: string;
  sellerFeedbackScore: number;
  shippingPrice: number;
  categoryId: string;
  categoryName: string;
}

// ==========================================
// EXPORTED PARSING UTILITIES
// ==========================================

export function parsePrice(
  text?: string | null,
  keyword?: string,
): { price: number; currency: string } | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();

  let currency = "GBP";
  if (cleaned.includes("$")) currency = "USD";
  else if (cleaned.includes("€")) currency = "EUR";

  // 1. Handle Ranges with Ratio Logic
  const rangeMatch = cleaned.match(/([\d.]+)\s*(to|-)\s*([\d.]+)/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[3]);
    const ratio = max / min;

    // Reject if the range is too wide (e.g., variation listing)
    if (ratio > 1.5) return null;

    // Domain Floor (Anti-Bait)
    if (keyword?.toLowerCase().includes("iphone") && min < 50) return null;

    return { price: min, currency };
  }

  // 2. Handle Single Prices
  const priceMatch = cleaned.match(/[\d.]+/);
  if (priceMatch) {
    const price = Number(priceMatch[0]);
    if (keyword?.toLowerCase().includes("iphone") && price < 50) return null;
    return { price, currency };
  }

  return null;
}

export function parseShipping(text?: string | null): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, "").toLowerCase().trim();

  if (cleaned.includes("free") || cleaned.includes("no postage")) return 0;

  const shippingMatch = cleaned.match(/[£$€]?([\d.]+)/);
  if (shippingMatch) {
    const value = Number(shippingMatch[1]);
    return value > 0 && value < 100 ? value : 0;
  }
  return 0;
}

export function parseSoldDate(text?: string | null): string {
  if (!text) return new Date().toISOString();
  const match = text.match(/Sold\s+(.*)/i);
  if (!match) return new Date().toISOString();

  let cleaned = match[1].trim().replace(",", "");
  const parts = cleaned.split(" ");
  if (parts.length !== 3) return new Date().toISOString();

  const [day, monthStr, year] = parts;
  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month = monthMap[monthStr];
  if (month === undefined) return new Date().toISOString();

  return new Date(Date.UTC(Number(year), month, Number(day))).toISOString();
}

export function parseSeller(text?: string | null): {
  username: string;
  feedback: number;
} {
  if (!text || /^[£$€]/.test(text.trim())) {
    return { username: "unknown", feedback: 0 };
  }

  const cleaned = text.replace(/Seller:/i, "").trim();
  const match = cleaned.match(/^([^\s]+)\s+.*\((\d+[\d.kK]*)\)/);

  if (match) {
    const username = match[1];
    let feedbackRaw = match[2].toLowerCase();
    let feedback = 0;

    if (feedbackRaw.includes("k")) {
      feedback = parseFloat(feedbackRaw.replace("k", "")) * 1000;
    } else {
      feedback = parseInt(feedbackRaw.replace(/\D/g, ""), 10);
    }
    return {
      username: username || "unknown",
      feedback: isNaN(feedback) ? 0 : feedback,
    };
  }

  return { username: cleaned.split(/\s+/)[0] || "unknown", feedback: 0 };
}

export function parseItemIdFromUrl(url?: string | null): string {
  if (!url) return "unknown";
  const cleanUrl = url.split("?")[0];
  const match = cleanUrl.match(/\/(\d{9,})/);
  return match ? match[1] : "unknown";
}

// ==========================================
// CORE NORMALIZATION LOGIC
// ==========================================

//This code is not being used currently, in case might be used in future if:
//we decide to save "Raw" HTML to your database today.
// If we change your price-parsing rules next month and need to re-run your entire database through
// the new logic to update old prices.
//

/* export function normalizeSoldItems(
  rawItems: RawSoldItem[],
  keyword: string,
): NormalizedListing[] {
  return rawItems
    .filter((r) => {
      if (!r.title) return false;
      const t = r.title.toLowerCase();
      return !(
        t.includes("shop on ebay") ||
        t.includes("advertisement") ||
        t.includes("sponsored")
      );
    })
    .map((r) => {
      const parsedPrice = parsePrice(r.priceText, keyword);
      if (!parsedPrice) return null;

      const ebayItemId = parseItemIdFromUrl(r.url);
      if (ebayItemId === "unknown") return null;

      return {
        ebayItemId,
        title: r.title!.trim(),
        price: parsedPrice.price,
        currency: parsedPrice.currency,
        soldDate: parseSoldDate(r.soldDateText),
        keyword,
        sellerUsername: parseSeller(r.sellerText).username,
        sellerFeedbackScore: parseSeller(r.sellerText).feedback,
        shippingPrice: parseShipping(r.shippingText),
        categoryId: "UNKNOWN",
        categoryName: "UNKNOWN",
      };
    })
    .filter((item): item is NormalizedListing => item !== null);
}
 */

// the above code originally written by chatGPT has been replaced with the one below written by Gemini

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface RawSoldItem {
  title?: string | null;
  priceText?: string | null;
  soldDateText?: string | null;
  sellerText?: string | null;
  shippingText?: string | null;
  url?: string | null;
}

export interface NormalizedListing {
  ebayItemId: string;
  title: string;
  price: number;
  currency: string;
  soldDate: string; // ISO string
  keyword: string;
  sellerUsername: string;
  sellerFeedbackScore: number;
  shippingPrice: number;
  categoryId: string;
  categoryName: string;
}

// ==========================================
// EXPORTED PARSING UTILITIES
// ==========================================

/**
 * Category-Agnostic Price Parser
 * Strips away domain-specific keywords and handles purely string extraction.
 */
export function parsePrice(
  text?: string | null,
): { price: number; currency: string } | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();

  let currency = "GBP";
  if (cleaned.includes("$")) currency = "USD";
  else if (cleaned.includes("€")) currency = "EUR";

  // 1. Handle Ranges with Ratio Logic
  const rangeMatch = cleaned.match(/([\d.]+)\s*(to|-)\s*([\d.]+)/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[3]);
    const ratio = max / min;

    // Reject if the range is too wide (e.g., variation listing item bait)
    if (ratio > 1.5) return null;

    // FIXED: iPhone keyword and hardcoded price floors have been completely purged from here.
    return { price: min, currency };
  }

  // 2. Handle Single Prices
  const priceMatch = cleaned.match(/[\d.]+/);
  if (priceMatch) {
    const price = Number(priceMatch[0]);

    // FIXED: Purged domain-specific assumptions to achieve 100% category-agnosticism.
    return { price, currency };
  }

  return null;
}

export function parseShipping(text?: string | null): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, "").toLowerCase().trim();

  if (cleaned.includes("free") || cleaned.includes("no postage")) return 0;

  const shippingMatch = cleaned.match(/[£$€]?([\d.]+)/);
  if (shippingMatch) {
    const value = Number(shippingMatch[1]);
    return value > 0 && value < 100 ? value : 0;
  }
  return 0;
}

export function parseSoldDate(text?: string | null): string {
  if (!text) return new Date().toISOString();
  const match = text.match(/Sold\s+(.*)/i);
  if (!match) return new Date().toISOString();

  let cleaned = match[1].trim().replace(",", "");
  const parts = cleaned.split(" ");
  if (parts.length !== 3) return new Date().toISOString();

  const [day, monthStr, year] = parts;
  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const month = monthMap[monthStr];
  if (month === undefined) return new Date().toISOString();

  return new Date(Date.UTC(Number(year), month, Number(day))).toISOString();
}

export function parseSeller(text?: string | null): {
  username: string;
  feedback: number;
} {
  if (!text || /^[£$€]/.test(text.trim())) {
    return { username: "unknown", feedback: 0 };
  }

  // FIXED: Added the empty string argument "" to cleanly wipe out the word "Seller:"
  const cleaned = text.replace(/Seller:/i, "").trim();
  const match = cleaned.match(/^([^\s]+)\s+.*\((\d+[\d.kK]*)\)/);
  if (match) {
    const username = match[1];
    let feedbackRaw = match[2].toLowerCase();
    let feedback = 0;

    if (feedbackRaw.includes("k")) {
      feedback = parseFloat(feedbackRaw.replace("k", "")) * 1000;
    } else {
      feedback = parseInt(feedbackRaw.replace(/\D/g, ""), 10);
    }
    return {
      username: username || "unknown",
      feedback: isNaN(feedback) ? 0 : feedback,
    };
  }

  return { username: cleaned.split(/\s+/)[0] || "unknown", feedback: 0 };
}

export function parseItemIdFromUrl(url?: string | null): string {
  if (!url) return "unknown";
  const cleanUrl = url.split("?")[0];
  const match = cleanUrl.match(/\/(\d{9,})/);
  return match ? match[1] : "unknown";
}
