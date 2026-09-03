import dotenv from "dotenv";
dotenv.config();

export const config = {
  ebayClientId: process.env.EBAY_CLIENT_ID || "",
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET || "",
  ebayCookieString: process.env.EBAY_COOKIE_STRING || "",
  headless: process.env.EBAY_HEADLESS !== "false",
};

