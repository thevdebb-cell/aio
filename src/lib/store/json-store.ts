import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { OrderRecord } from "../../types/types.js";
import { log } from "../logger.js";
import {
  type Store,
  type GuildSettings,
  type TicketRecord,
  type RatingRecord,
  type PrefixLogRecord,
  type ModRecord,
  type ModRecordType,
  defaultGuildSettings,
} from "./types.js";

/**
 * Zero-dependency JSON store. One file per collection under data/.
 * Fine for a single bot process; writes are atomic (temp file + rename).
 * For the download website integration, switch STORE_DRIVER=supabase.
 */
export class JsonStore implements Store {
  private dir: string;
  private guilds = new Map<string, GuildSettings>();
  private tickets = new Map<string, TicketRecord>();
  private orders = new Map<string, OrderRecord>();
  private ratings: RatingRecord[] = [];
  private prefixLogs: PrefixLogRecord[] = [];
  private modRecords: ModRecord[] = [];

  constructor(dir = join(process.cwd(), "data")) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.guilds = new Map(Object.entries(this.read<Record<string, GuildSettings>>("guilds", {})));
    this.tickets = new Map(Object.entries(this.read<Record<string, TicketRecord>>("tickets", {})));
    this.orders = new Map(Object.entries(this.read<Record<string, OrderRecord>>("orders", {})));
    this.ratings = this.read<RatingRecord[]>("ratings", []);
    this.prefixLogs = this.read<PrefixLogRecord[]>("prefixlogs", []);
    this.modRecords = this.read<ModRecord[]>("modrecords", []);
    log.info(`[store] json store ready (${this.dir})`);
  }

  private file(name: string): string {
    return join(this.dir, `${name}.json`);
  }

  private read<T>(name: string, fallback: T): T {
    const path = this.file(name);
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch (err) {
      log.error(`[store] failed to read ${name}.json`, err);
      return fallback;
    }
  }

  private write(name: string, data: unknown): void {
    const path = this.file(name);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, path);
  }

  // ── guild settings ──
  async getGuild(guildId: string): Promise<GuildSettings> {
    let g = this.guilds.get(guildId);
    if (!g) {
      g = defaultGuildSettings(guildId);
      this.guilds.set(guildId, g);
      this.write("guilds", Object.fromEntries(this.guilds));
    }
    return g;
  }

  async saveGuild(settings: GuildSettings): Promise<void> {
    this.guilds.set(settings.guildId, settings);
    this.write("guilds", Object.fromEntries(this.guilds));
  }

  // ── tickets ──
  async createTicket(t: TicketRecord): Promise<void> {
    this.tickets.set(t.channelId, t);
    this.write("tickets", Object.fromEntries(this.tickets));
  }

  async getTicket(channelId: string): Promise<TicketRecord | null> {
    return this.tickets.get(channelId) ?? null;
  }

  async updateTicket(channelId: string, patch: Partial<TicketRecord>): Promise<TicketRecord | null> {
    const cur = this.tickets.get(channelId);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.tickets.set(channelId, next);
    this.write("tickets", Object.fromEntries(this.tickets));
    return next;
  }

  async deleteTicket(channelId: string): Promise<void> {
    this.tickets.delete(channelId);
    this.write("tickets", Object.fromEntries(this.tickets));
  }

  async listTicketsByType(guildId: string, type: string): Promise<TicketRecord[]> {
    return [...this.tickets.values()].filter((t) => t.guildId === guildId && t.type === type);
  }

  // ── orders ──
  async createOrder(o: OrderRecord): Promise<void> {
    this.orders.set(o.id, o);
    this.write("orders", Object.fromEntries(this.orders));
  }

  async getOrder(id: string): Promise<OrderRecord | null> {
    return this.orders.get(id) ?? null;
  }

  async updateOrder(id: string, patch: Partial<OrderRecord>): Promise<OrderRecord | null> {
    const cur = this.orders.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.orders.set(id, next);
    this.write("orders", Object.fromEntries(this.orders));
    return next;
  }

  // ── ratings ──
  async addRating(r: RatingRecord): Promise<void> {
    this.ratings.push(r);
    this.write("ratings", this.ratings);
  }

  async listRatings(designerId?: string): Promise<RatingRecord[]> {
    return designerId ? this.ratings.filter((r) => r.designerId === designerId) : [...this.ratings];
  }

  // ── prefix logs ──
  async addPrefixLog(l: PrefixLogRecord): Promise<void> {
    this.prefixLogs.push(l);
    // keep last 1000
    if (this.prefixLogs.length > 1000) this.prefixLogs = this.prefixLogs.slice(-1000);
    this.write("prefixlogs", this.prefixLogs);
  }

  async listPrefixLogs(guildId: string, limit: number): Promise<PrefixLogRecord[]> {
    return this.prefixLogs
      .filter((l) => l.guildId === guildId)
      .slice(-limit)
      .reverse();
  }

  // ── mod records ──
  async addModRecord(r: ModRecord): Promise<void> {
    this.modRecords.push(r);
    this.write("modrecords", this.modRecords);
  }

  async listModRecords(guildId: string, filter?: { targetId?: string; type?: ModRecordType }): Promise<ModRecord[]> {
    return this.modRecords.filter(
      (r) =>
        r.guildId === guildId &&
        (!filter?.targetId || r.targetId === filter.targetId) &&
        (!filter?.type || r.type === filter.type),
    );
  }
}
