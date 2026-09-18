import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Netlify Function: /dl?id=<orderId>&t=<exp>.<sig>
 *
 * Verifies the HMAC token (shared DOWNLOAD_SECRET with the bot), then hands out
 * a short-lived Supabase signed URL for the order's latest file and redirects.
 *
 * Required env (Netlify → Site settings → Environment variables):
 *   DOWNLOAD_SECRET       must match the bot's DOWNLOAD_SECRET
 *   SUPABASE_URL          your Supabase project URL
 *   SUPABASE_SERVICE_KEY  service role key (server-side only, never in the browser)
 *   SUPABASE_BUCKET       storage bucket (default "orders")
 */

function page(status, title, message) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Star Customs — ${title}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#e8e8ea;
       font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .card{max-width:460px;padding:40px 32px;text-align:center;border:1px solid #1e1e22;border-radius:16px;background:#111114}
  h1{margin:0 0 8px;font-size:22px;letter-spacing:.02em}
  p{margin:0;color:#a1a1aa;line-height:1.6}
  .tag{display:inline-block;margin-bottom:18px;font-size:12px;letter-spacing:.25em;color:#71717a;text-transform:uppercase}
</style></head>
<body><div class="card"><div class="tag">Star Customs</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const t = url.searchParams.get("t");
  if (!id || !t) return page(400, "Invalid link", "This download link is missing information.");

  const [expStr, sig] = t.split(".");
  const exp = Number(expStr);
  const secret = process.env.DOWNLOAD_SECRET || "";
  if (!expStr || !sig || Number.isNaN(exp)) return page(410, "Invalid link", "This download link is malformed.");

  const expected = createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return page(410, "Invalid link", "This download link could not be verified.");
  if (Date.now() > exp) return page(410, "Link expired", "This link has expired. Open your DMs and use the Regen link button to get a fresh one.");

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const bucket = process.env.SUPABASE_BUCKET || "orders";

  const { data: list, error } = await supabase.storage
    .from(bucket)
    .list(`orders/${id}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !list || list.length === 0) return page(404, "Nothing to download", "We couldn't find files for this order.");

  const file = list[0];
  const path = `orders/${id}/${file.name}`;
  const { data: signed, error: e2 } = await supabase.storage.from(bucket).createSignedUrl(path, 120, { download: true });
  if (e2 || !signed) return page(500, "Download error", "Could not generate the download. Please try again.");

  return Response.redirect(signed.signedUrl, 302);
};
