import type { FileStore } from "./types.js";
import { LocalFileStore } from "./local.js";
import { log } from "../logger.js";

let instance: FileStore | null = null;

export async function initFileStore(): Promise<FileStore> {
  const driver = (process.env.FILE_DRIVER ?? "local").toLowerCase();
  if (driver === "supabase") {
    try {
      const { SupabaseFileStore } = await import("./supabase.js");
      instance = new SupabaseFileStore();
    } catch (err) {
      log.error("[files] FILE_DRIVER=supabase failed to load (npm i @supabase/supabase-js?). Falling back to local.", err);
      instance = new LocalFileStore();
    }
  } else {
    instance = new LocalFileStore();
  }
  await instance.init();
  return instance;
}

export function files(): FileStore {
  if (!instance) throw new Error("File store not initialised — call initFileStore() first.");
  return instance;
}

export function linkTtlSeconds(): number {
  return Number(process.env.DOWNLOAD_LINK_TTL_MINUTES ?? 10) * 60;
}
