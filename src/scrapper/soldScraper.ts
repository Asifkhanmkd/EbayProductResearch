import { chromium, Page, BrowserContext } from "playwright";
import { RawSoldPayload } from "../core/market/soldDto";
import { config } from "../utils/config";

export interface ScrapedRowItem {
  title: string | null;
  url: string | null;
  priceRaw: string | null;
  soldDateRaw: string | null;
  sellerRaw: string | null;
  shippingRaw: string | null;
  condition: string;
}

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
          headless: true, // Seamless background enterprise operations
          viewport: { width: 1280, height: 720 },
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          locale: "en-GB",
          // ✅ HIGH-SPEED BINARY INJECTION FLAGS:
          // Instructs the Chromium process itself to block heavy layout extensions and plugins completely
          args: [
            "--blink-settings=imagesEnabled=false", // Kills all image asset fetching natively
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--mute-audio",
            "--no-sandbox",
          ],
        },
      );

      // ➔ INJECT COOKIES HERE RIGHT AFTER CONTEXT INITIALIZATION
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

      // ✅ GLOBAL CONTEXT ROUTE LOCK: Configured once at startup, NOT on every page tab instantiation
      await this.sharedContext.route("**/*", (route) => {
        const type = route.request().resourceType();
        const url = route.request().url().toLowerCase();

        // Drop layout files, tracking matrices, and analytical analytics scripts immediately
        if (
          ["stylesheet", "font", "media", "image"].includes(type) ||
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
        }, 100); // Accelerated scroll cadence
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
    // ✅ Target any structural container or list element inside the search results frame
    return await page.$$eval("li, div.s-card, div.s-item", (elements) => {
      return elements
        .map((el) => {
          // Ensure we are looking at an actual product card container by checking for text length or structural presence
          const textContent = el.textContent ?? "";
          if (!textContent.includes("£") && !textContent.includes("Sold")) {
            return null;
          }

          // 1. Extract Title: look for heading elements or styled text inside the card
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

          // 2. Extract Link / URL
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
          const priceRaw = priceCandidates[0]?.textContent?.trim() ?? null;

          // 4. Extract Sold Date: look for strings matching "Sold" patterns
          const soldDateNode = Array.from(
            el.querySelectorAll("span, div"),
          ).find(
            (node) =>
              node.children.length === 0 &&
              /Sold\s+\d/i.test(node.textContent ?? ""),
          );
          const soldDateRaw = soldDateNode?.textContent?.trim() ?? null;

          // If no "Sold" indicator node is found in this element block, skip it to ensure accurate realized metrics
          if (!soldDateRaw) return null;

          // 5. Extract Shipping & Seller info from inner text rows
          const rows = Array.from(el.querySelectorAll("div, span")).map(
            (n) => n.textContent?.trim() || "",
          );
          const shippingRaw =
            rows.find((r) => /delivery|postage|free/i.test(r)) || null;
          const sellerRaw =
            rows.find((r) => r.includes("100%") || /\(\d+\)/.test(r)) || null;

          // 6. Extract Condition
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
          // Filter out nulls and deduplicate by URL or title
          if (!x) return false;
          if (index === 0) return true;
          const prev = self[index - 1];
          return prev ? prev.url !== x.url || prev.title !== x.title : true;
        });
    });
  }
  /**
   * HIGH-PERFORMANCE SCRAPING GATE WITH STRICT UN-BLOCKABLE SPEED ALIGNMENT
   */
  public static async fetchSoldArchive(
    keyword: string,
    maxPages = 1,
  ): Promise<RawSoldPayload[]> {
    if (!keyword || keyword.trim() === "") return [];

    await this.initializeSharedEngine();
    if (!this.sharedContext) return [];

    const page = await this.sharedContext.newPage();
    const allFinalResults: ScrapedRowItem[] = [];

    try {
      const baseSearchUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(keyword)}&LH_Sold=1&LH_Complete=1`;

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const searchUrl =
          pageNum === 1 ? baseSearchUrl : `${baseSearchUrl}&_pgn=${pageNum}`;

        console.log(
          `🕵️ [Playwright Debug]: Navigating to sold search URL: "${searchUrl}"`,
        );

        // ✅ SECURE SPEED VECTOR: Uses quick domcontentloaded parsing with a conservative 15s execution threshold
        await page.goto(searchUrl, {
          //waitUntil: "domcontentloaded",
          waitUntil: "load",

          timeout: 15000,
        });

        if (pageNum === 1) {
          await this.handleCookieBanner(page);
        }

        await this.simulateHuman(page);
        await this.autoScroll(page);

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

        const items = await this.extractRawItems(page);

        console.log(
          `🕵️ [Playwright Debug]: Extracted ${items.length} raw historical items from DOM for keyword: "${keyword}"`,
        );
        if (items.length === 0) break;

        allFinalResults.push(...items);
        if (pageNum < maxPages) await this.randomDelay(200, 800);
      }
    } catch (err) {
      console.error(
        `❌ [Playwright Error]: Exception caught during fetchSoldArchive for "${keyword}":`,
        err,
      );

      // Swallows timeouts gracefully to prevent loop execution failures
    } finally {
      await page.close();
    }

    const uniqueMap = new Map<string, ScrapedRowItem>();
    for (const item of allFinalResults) {
      if (item && item.url) uniqueMap.set(item.url, item);
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

      const payload: ExtendedSoldPayload = {
        itemId: item.url
          ? item.url.match(/itm\/(\d+)/)?.[1] ||
            `scraped-${Math.random().toString(36).substring(7)}`
          : `scraped-${Math.random().toString(36).substring(7)}`,
        title: item.title || "Unknown Completed Sale Descriptor",
        price: {
          value: cleanPriceStr || "0.00",
          currency: "GBP",
        },
        condition: item.condition,
      };

      payload.shippingCost = shippingValue;
      return payload as RawSoldPayload;
    });
  }
}
