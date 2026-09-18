import { createHmac } from "node:crypto";
import { linkTtlSeconds } from "./files.js";

/** True when a Netlify download site is configured. */
export function siteEnabled(): boolean {
  return Boolean(process.env.SITE_BASE_URL);
}

/**
 * Build an expiring download link that points at the Netlify site.
 * The token binds the order id + expiry with an HMAC using DOWNLOAD_SECRET
 * (the same secret must be set in the Netlify function's environment).
 */
export function buildSiteLink(orderId: string): string {
  const secret = process.env.DOWNLOAD_SECRET ?? "";
  const exp = Date.now() + linkTtlSeconds() * 1000;
  const sig = createHmac("sha256", secret).update(`${orderId}.${exp}`).digest("base64url");
  const base = (process.env.SITE_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/dl?id=${encodeURIComponent(orderId)}&t=${exp}.${sig}`;
}
