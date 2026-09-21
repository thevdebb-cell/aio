import { log } from "../logger.js";
import type { FileStore, StoredFileMeta } from "./types.js";

/**
 * Supabase Storage file store. Signed URLs expire natively - pass the TTL you
 * want (e.g. 600s) and that's your "valid for 10 minutes" link, no site needed.
 * Your branded download page can also just wrap these signed URLs.
 *
 * env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET (default "orders").
 */
export class SupabaseFileStore implements FileStore {
  private db: any;
  private bucket = process.env.SUPABASE_BUCKET ?? "orders";

  async init(): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY required for the supabase file store.");
    // @ts-ignore - optional dependency
    const mod = await import("@supabase/supabase-js");
    this.db = mod.createClient(url, key, { auth: { persistSession: false } });
    log.info(`[files] supabase file store ready (bucket ${this.bucket})`);
  }

  async upload(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void> {
    const { error } = await this.db.storage.from(this.bucket).upload(key, buffer, {
      contentType: meta.contentType,
      upsert: true,
    });
    if (error) throw error;
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.db.storage.from(this.bucket).createSignedUrl(key, ttlSeconds);
    if (error) throw error;
    return data.signedUrl as string;
  }
}
