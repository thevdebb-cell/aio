import type { OrderRecord } from "../../types/index.js";
import { log } from "../logger.js";
import {
  type Store,
  type GuildSettings,
  type TicketRecord,
  type RatingRecord,
  type PrefixLogRecord,
  defaultGuildSettings,
} from "./types.js";

/**
 * Supabase (Postgres) driver.
 *
 * Requires `npm i @supabase/supabase-js` and these env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * See the SQL schema in README.md (section "Supabase schema").
 * The download website can talk to the same project using signed URLs
 * (Supabase Storage) which expire — a perfect fit for the 10-minute links.
 */
export class SupabaseStore implements Store {
  // typed as any so the project compiles without the package installed
  private db: any;

  async init(): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are required for the supabase driver.");
    // @ts-ignore — optional dependency, only present when the owner opts into Supabase
    const mod = await import("@supabase/supabase-js");
    this.db = mod.createClient(url, key, { auth: { persistSession: false } });
    log.info("[store] supabase store ready");
  }

  async getGuild(guildId: string): Promise<GuildSettings> {
    const { data } = await this.db.from("guilds").select("data").eq("guild_id", guildId).maybeSingle();
    if (data?.data) return data.data as GuildSettings;
    const fresh = defaultGuildSettings(guildId);
    await this.saveGuild(fresh);
    return fresh;
  }

  async saveGuild(settings: GuildSettings): Promise<void> {
    await this.db.from("guilds").upsert({ guild_id: settings.guildId, data: settings });
  }

  async createTicket(t: TicketRecord): Promise<void> {
    await this.db.from("tickets").upsert({ channel_id: t.channelId, data: t });
  }
  async getTicket(channelId: string): Promise<TicketRecord | null> {
    const { data } = await this.db.from("tickets").select("data").eq("channel_id", channelId).maybeSingle();
    return (data?.data as TicketRecord) ?? null;
  }
  async updateTicket(channelId: string, patch: Partial<TicketRecord>): Promise<TicketRecord | null> {
    const cur = await this.getTicket(channelId);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await this.db.from("tickets").upsert({ channel_id: channelId, data: next });
    return next;
  }
  async deleteTicket(channelId: string): Promise<void> {
    await this.db.from("tickets").delete().eq("channel_id", channelId);
  }
  async listTicketsByType(guildId: string, type: string): Promise<TicketRecord[]> {
    const { data } = await this.db.from("tickets").select("data");
    return ((data ?? []) as { data: TicketRecord }[]).map((r) => r.data).filter((t) => t.guildId === guildId && t.type === type);
  }

  async createOrder(o: OrderRecord): Promise<void> {
    await this.db.from("orders").insert({ id: o.id, data: o });
  }
  async getOrder(id: string): Promise<OrderRecord | null> {
    const { data } = await this.db.from("orders").select("data").eq("id", id).maybeSingle();
    return (data?.data as OrderRecord) ?? null;
  }
  async updateOrder(id: string, patch: Partial<OrderRecord>): Promise<OrderRecord | null> {
    const cur = await this.getOrder(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await this.db.from("orders").upsert({ id, data: next });
    return next;
  }

  async addRating(r: RatingRecord): Promise<void> {
    await this.db.from("ratings").insert({ id: r.id, data: r });
  }
  async listRatings(designerId?: string): Promise<RatingRecord[]> {
    const { data } = await this.db.from("ratings").select("data");
    const all = ((data ?? []) as { data: RatingRecord }[]).map((r) => r.data);
    return designerId ? all.filter((r) => r.designerId === designerId) : all;
  }

  async addPrefixLog(l: PrefixLogRecord): Promise<void> {
    await this.db.from("prefix_logs").insert({ data: l });
  }
  async listPrefixLogs(guildId: string, limit: number): Promise<PrefixLogRecord[]> {
    const { data } = await this.db.from("prefix_logs").select("data").order("id", { ascending: false }).limit(limit);
    return ((data ?? []) as { data: PrefixLogRecord }[]).map((r) => r.data).filter((l) => l.guildId === guildId);
  }
}
