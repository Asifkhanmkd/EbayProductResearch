import { chromium, Page, BrowserContext } from "playwright";
import { RawSoldPayload } from "../core/market/soldDto";
import { config } from "../utils/config";
import {
  MARKET_WINDOW_DAYS,
  MAX_SOLD_PAGES,
} from "../core/market/marketConfig";

export interface ScrapedRowItem {
  title: string | null;
  url: string | null;
  priceRaw: string | null;
  soldDateRaw: string | null;
  sellerRaw: string | null;
  shippingRaw: string | null;
  condition: string;
}

// ✅ FIX: sanity ceiling. No listing in these categories should
// realistically exceed this — anything above it is almost certainly a
// scraped-text concatenation bug (a price range, a hidden date/ID
// string, or a currency-conversion estimate glued onto the real price
// once all non-digit characters get stripped). Discarding it (setting
// price to 0) lets it fall out of the price arrays downstream exactly
// like any other unparseable price already does, instead of silently
// poisoning a segment's median.
const MAX_PLAUSIBLE_PRICE_GBP = 10000;

export class HtmlHistoryParser {
  private static sharedContext: BrowserContext | null = null;
  private static isInitializing = false;

  /**
   * Thread-Safe Context Initializer Layer
   * ✅ FIXED: Blocks redundant assets directly at the binary compilation engine level
   */
  public static async initializeSharedEngine(): Promise<void> {
    if (this.sharedContext) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    try {
      console.log(
        "🌐 [Browser Pool Engine]: Spawning optimized background global Chromium context...",
      );

      this.sharedContext = await chromium.launchPersistentContext(
        "./user-data",
        {
          headless: config.headless,
          slowMo: 500,
          viewport: { width: 1280, height: 720 },
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          locale: "en-GB",
          args: [
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--mute-audio",
            "--no-sandbox",
          ],
        },
      );

      const clientCookies = config.ebayCookieString;

      if (!clientCookies) {
        throw new Error(
          "❌ [Configuration Error]: EBAY_COOKIE_STRING is missing from environment variables.",
        );
      }

      const parsedCookies = clientCookies.split(";").map((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        return {
          name,
          value: rest.join("="),
          domain: ".ebay.co.uk",
          path: "/",
        };
      });
      await this.sharedContext.addCookies(parsedCookies);

      await this.sharedContext.route("**/*", (route) => {
        const type = route.request().resourceType();
        const url = route.request().url().toLowerCase();

        if (
          url.includes("analytics") ||
          url.includes("doubleclick") ||
          url.includes("ebaystatic.com/ur")
        ) {
          return route.abort();
        }
        return route.continue();
      });
    } catch (err) {
      console.error(
        "❌ Failed to establish background global shared browser context instance:",
        err,
      );
      this.sharedContext = null;
    } finally {
      this.isInitializing = false;
    }
  }

  public static async closeSharedEngine(): Promise<void> {
    if (this.sharedContext) {
      console.log(
        "🌐 [Browser Pool Engine]: Flushing context allocations. Terminating Chromium framework...",
      );
      await this.sharedContext.close();
      this.sharedContext = null;
    }
  }

  private static async randomDelay(
    minMs: number,
    maxMs: number,
  ): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  private static async handleCookieBanner(page: Page): Promise<void> {
    try {
      const acceptBtn = await page.$(
        'button[aria-label="Accept all"], button#gdpr-banner-accept',
      );
      if (acceptBtn) await acceptBtn.click();
    } catch {}
  }

  private static async simulateHuman(page: Page): Promise<void> {
    try {
      await page.mouse.move(100 + Math.random() * 50, 100 + Math.random() * 50);
    } catch {}
  }

  private static async extractRawItems(page: Page): Promise<ScrapedRowItem[]> {
    return await page.$$eval("li, div.s-card, div.s-item", (elements) => {
      return elements
        .map((el) => {
          const textContent = el.textContent ?? "";
          if (!textContent.includes("£") && !textContent.includes("Sold")) {
            return null;
          }

          const headingEl = el.querySelector(
            '[role="heading"], h3, .s-card__title, .s-item__title',
          );
          let title = headingEl?.textContent?.trim() ?? null;

          if (title) {
            title = title
              .replace(/^New\s+listing/i, "")
              .replace(/opens in a new window or tab/i, "")
              .trim();
          }

          if (!title || title === "Shop on eBay" || title.length < 5)
            return null;

          const linkEl = el.querySelector(
            'a[href*="/itm/"]',
          ) as HTMLAnchorElement | null;
          const url = linkEl?.href ?? null;

          // 3. Extract Price: look for elements containing currency symbols
          const priceCandidates = Array.from(
            el.querySelectorAll("span, div"),
          ).filter(
            (node) =>
              node.children.length === 0 &&
              /[£$€]\s?\d+/.test(node.textContent ?? ""),
          );

          const rawCandidateText =
            priceCandidates[0]?.textContent?.trim() ?? null;

          // ✅ FIX: extract ONLY the first well-formed currency amount
          // from the candidate node's text, instead of taking its full
          // textContent verbatim. A leaf node's text can still contain
          // more than just the price — a price RANGE for multi-variation
          // listings ("£19.35 to £399.00"), a currency-conversion
          // estimate, or other adjacent digits with no separating
          // whitespace. Downstream code strips every non-digit
          // character to parse the number, so any extra digit sequence
          // left in priceRaw gets silently concatenated onto the real
          // price. Matching a single "£<digits><.digits>" pattern here
          // closes off that entire failure class at the source.
          const priceMatch = rawCandidateText?.match(
            /[£$€]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/,
          );
          const priceRaw = priceMatch ? priceMatch[0] : rawCandidateText;

          // 4. Extract Sold Date: look for strings matching "Sold" patterns
          const soldDateNode = Array.from(
            el.querySelectorAll("span, div"),
          ).find(
            (node) =>
              node.children.length === 0 &&
              /Sold\s+\d/i.test(node.textContent ?? ""),
          );
          const soldDateRaw = soldDateNode?.textContent?.trim() ?? null;

          if (!soldDateRaw) return null;

          const rows = Array.from(el.querySelectorAll("div, span")).map(
            (n) => n.textContent?.trim() || "",
          );
          const shippingRaw =
            rows.find((r) => /delivery|postage|free/i.test(r)) || null;
          const sellerRaw =
            rows.find((r) => r.includes("100%") || /\(\d+\)/.test(r)) || null;

          const conditionMatch = textContent.match(
            /Parts only|For parts or not working|Pre-owned|Used|Brand new|Opened – never used|Refurbished/i,
          );

          let condition = conditionMatch?.[0]?.toUpperCase() ?? "UNKNOWN";
          if (condition === "PRE-OWNED") condition = "USED";
          else if (condition === "BRAND NEW") condition = "BRAND_NEW";
          else if (condition === "PARTS ONLY")
            condition = "FOR PARTS OR NOT WORKING";

          return {
            title,
            url,
            priceRaw,
            soldDateRaw,
            sellerRaw,
            shippingRaw,
            condition,
          };
        })
        .filter((x, index, self): x is NonNullable<typeof x> => {
          if (!x) return false;
          if (index === 0) return true;
          const prev = self[index - 1];
          return prev ? prev.url !== x.url || prev.title !== x.title : true;
        });
    });
  }

  public static parseSoldDate(
    raw: string | null,
    now = new Date(),
  ): Date | null {
    if (!raw) return null;
    const cleaned = raw.replace(/Sold/i, "").replace(/,/g, "").trim();
    const withYear = /\b\d{4}\b/.test(cleaned)
      ? cleaned
      : `${cleaned} ${now.getUTCFullYear()}`;
    const parsed = new Date(`${withYear} UTC`);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getTime() > now.getTime())
      parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
    return parsed;
  }

  private static isWithinMarketWindow(
    date: Date | null,
    windowDays: number,
    now = new Date(),
  ): boolean {
    if (!date) return false;
    const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    return date.getTime() >= cutoff.getTime();
  }

  public static async fetchSoldArchive(
    keyword: string,
    maxPages = MAX_SOLD_PAGES,
    windowDays = MARKET_WINDOW_DAYS,
    categoryId?: string,
  ): Promise<RawSoldPayload[]> {
    if (!keyword || keyword.trim() === "") return [];

    await this.initializeSharedEngine();
    if (!this.sharedContext) return [];

    const page = await this.sharedContext.newPage();
    const allFinalResults: ScrapedRowItem[] = [];

    try {
      const categoryParam = categoryId
        ? `&_sacat=${encodeURIComponent(categoryId)}`
        : "";
      const baseSearchUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(keyword)}${categoryParam}&LH_Sold=1&LH_Complete=1`;

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const searchUrl =
          pageNum === 1 ? baseSearchUrl : `${baseSearchUrl}&_pgn=${pageNum}`;

        const MAX_PAGE_ATTEMPTS = 3;
        let pageSucceeded = false;
        let items: ScrapedRowItem[] = [];

        for (
          let attempt = 1;
          attempt <= MAX_PAGE_ATTEMPTS && !pageSucceeded;
          attempt++
        ) {
          try {
            console.log(
              `🕵️ [Playwright Debug]: Navigating to sold search URL: "${searchUrl}"${attempt > 1 ? ` (retry ${attempt}/${MAX_PAGE_ATTEMPTS})` : ""}`,
            );

            await page.goto(searchUrl, {
              waitUntil: "load",
              timeout: 15000,
            });

            if (pageNum === 1) {
              await this.handleCookieBanner(page);
            }

            await this.simulateHuman(page);

            try {
              await this.autoScroll(page);
            } catch (scrollErr) {
              console.log(
                `   ⚠️ Auto-scroll interrupted for "${keyword}" (likely a redirect/popup) — continuing without it.`,
              );
            }

            try {
              await page.waitForSelector(".s-item, .s-card, li.s-item", {
                timeout: 8000,
              });
            } catch (selectorErr) {
              const contentSnippet = await page.content();
              console.log(
                `🕵️ [Playwright Debug]: Selector timeout for keyword: "${keyword}". HTML Page Length: ${contentSnippet.length}`,
              );
              break;
            }

            items = await this.extractRawItems(page);
            pageSucceeded = true;
          } catch (pageErr) {
            console.log(
              `   ⚠️ Page ${pageNum} attempt ${attempt}/${MAX_PAGE_ATTEMPTS} failed for "${keyword}": ${(pageErr as Error).message}`,
            );
            if (attempt < MAX_PAGE_ATTEMPTS) {
              await this.randomDelay(500, 1200);
            }
          }
        }

        if (!pageSucceeded) {
          console.log(
            `   ❌ Page ${pageNum} failed after ${MAX_PAGE_ATTEMPTS} attempts for "${keyword}" — keeping ${allFinalResults.length} items already collected, stopping pagination here.`,
          );
          break;
        }

        const recentItems = items.filter((item) =>
          this.isWithinMarketWindow(
            this.parseSoldDate(item.soldDateRaw),
            windowDays,
          ),
        );

        const hasNextPage =
          (await page
            .locator(
              'a[aria-label="Go to next search page"], a.pagination__next',
            )
            .count()) > 0;

        console.log(
          `🕵️ [Playwright Debug]: Extracted ${items.length} raw historical items (${recentItems.length} within ${windowDays}d) from DOM for keyword: "${keyword}"`,
        );

        if (items.length === 0) break;

        allFinalResults.push(...recentItems);

        if (!hasNextPage) break;
        if (pageNum < maxPages) await this.randomDelay(200, 800);
      }
    } catch (err) {
      console.error(
        `❌ [Playwright Error]: Exception caught during fetchSoldArchive for "${keyword}":`,
        err,
      );
    } finally {
      await page.close();
    }

    const uniqueMap = new Map<string, ScrapedRowItem>();
    for (const item of allFinalResults) {
      const normalizedTitle = (item.title || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const closePrice = item.priceRaw
        ? item.priceRaw.replace(/[^\d.]/g, "")
        : "0";
      const dedupeKey =
        item.url ||
        `${normalizedTitle}|${item.sellerRaw || "UNKNOWN"}|${closePrice}|${item.soldDateRaw || ""}`;
      if (item) uniqueMap.set(dedupeKey, item);
    }
    const dedupedRaw = Array.from(uniqueMap.values());

    interface ExtendedSoldPayload extends RawSoldPayload {
      shippingCost?: number;
      [key: string]: any;
    }

    return dedupedRaw.map((item): RawSoldPayload => {
      const cleanPriceStr = item.priceRaw
        ? item.priceRaw.replace(/[^\d\.]/g, "")
        : "0";
      const cleanShippingStr = item.shippingRaw
        ? item.shippingRaw.replace(/[^\d\.]/g, "")
        : "0";

      const isFreePostage = item.shippingRaw && /free/i.test(item.shippingRaw);
      const shippingValue = isFreePostage
        ? 0
        : parseFloat(cleanShippingStr) || 0;

      let parsedPrice = parseFloat(cleanPriceStr) || 0;

      // ✅ FIX: sanity backstop. If the regex fix above still lets
      // something implausible through (e.g. an unusual DOM layout we
      // haven't seen yet), discard it here rather than let it corrupt
      // a segment's median. Setting price to 0 lets it fall out of
      // downstream price arrays exactly like any other unparseable
      // price already does.
      if (parsedPrice > MAX_PLAUSIBLE_PRICE_GBP) {
        console.log(
          `   ⚠️ Discarding implausible scraped price £${parsedPrice.toFixed(2)} for "${item.title}" (raw: "${item.priceRaw}") — likely a text-concatenation parsing bug.`,
        );
        parsedPrice = 0;
      }

      const payload: ExtendedSoldPayload = {
        itemId: item.url
          ? item.url.match(/itm\/(\d+)/)?.[1] ||
            `scraped-${Math.random().toString(36).substring(7)}`
          : `scraped-${Math.random().toString(36).substring(7)}`,
        title: item.title || "Unknown Completed Sale Descriptor",
        price: {
          value: parsedPrice > 0 ? parsedPrice.toFixed(2) : "0.00",
          currency: "GBP",
        },
        condition: item.condition,
      };

      payload.shippingCost = shippingValue;
      return payload as RawSoldPayload;
    });
  }
}
