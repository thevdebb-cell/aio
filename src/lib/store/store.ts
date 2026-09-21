import { randomBytes, randomUUID } from "node:crypto";
import type { Store } from "./types.js";
import { JsonStore } from "./json-store.js";
import { log } from "../logger.js";

let instance: Store | null = null;

export async function initStore(): Promise<Store> {
  const driver = (process.env.STORE_DRIVER ?? "json").toLowerCase();

  if (driver === "supabase") {
    // Lazy-loaded so the project runs without @supabase/supabase-js installed
    // until you actually opt into Supabase.
    try {
      const { SupabaseStore } = await import("./supabase-store.js");
      instance = new SupabaseStore();
    } catch (err) {
      log.error(
        "[store] STORE_DRIVER=supabase but the supabase driver failed to load. " +
          "Did you run `npm i @supabase/supabase-js`? Falling back to json.",
        err,
      );
      instance = new JsonStore();
    }
  } else {
    instance = new JsonStore();
  }

  await instance.init();
  return instance;
}

export function store(): Store {
  if (!instance) throw new Error("Store not initialised - call initStore() first.");
  return instance;
}

/**
 * Complex, unique, traceable order id.
 * Format: SC-XXXXXXXX-XXXX  (uppercase base32-ish + short random tail)
 * Collisions are astronomically unlikely; the store still rejects duplicates.
 */
export function newOrderId(): string {
  const core = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const tail = randomBytes(2).toString("hex").toUpperCase();
  return `SC-${core}-${tail}`;
}

export function newId(prefix = "id"): string {
  return `${prefix}_${randomUUID()}`;
}
