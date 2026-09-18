import type { OrderRecord, ServiceStatus, SupportCategory, OrderTicketType } from "../../types/index.js";

/** Per-guild settings, mostly filled by !setup. */
export interface GuildSettings {
  guildId: string;
  supportOpen: boolean;
  roles: Record<string, string>; // logical name -> role id
  channels: Record<string, string>; // logical name -> channel id
  /** live service statuses override the config defaults once !service is used */
  serviceStatus: Record<string, ServiceStatus>;
}

export interface TicketRecord {
  channelId: string;
  guildId: string;
  kind: "support" | "order";
  /** support category or order type */
  type: SupportCategory | OrderTicketType;
  ownerId: string; // user who opened it
  claimedBy: string | null;
  claimId: string | null; // role bucket that may claim (e.g. "graphic")
  createdAt: number;
  addedUsers: string[];
  orderId: string | null; // linked order (order tickets)
}

export interface RatingRecord {
  id: string;
  orderId: string;
  designerId: string;
  buyerId: string;
  stars: number;
  comment: string | null;
  anonymous: boolean;
  createdAt: number;
}

export interface PrefixLogRecord {
  userId: string;
  command: string;
  raw: string;
  guildId: string;
  channelId: string;
  createdAt: number;
}

export type ModRecordType = "warn" | "ban" | "kick" | "timeout" | "untimeout" | "infraction" | "promotion";

export interface ModRecord {
  id: string;
  guildId: string;
  type: ModRecordType;
  /** for infractions/promotions: who it targets ("staff" | "designer") */
  category: "staff" | "designer" | null;
  targetId: string;
  moderatorId: string;
  reason: string;
  /** free-form extra (e.g. new rank for a promotion, duration for a timeout) */
  extra: string | null;
  createdAt: number;
}

export interface Store {
  init(): Promise<void>;

  // guild settings
  getGuild(guildId: string): Promise<GuildSettings>;
  saveGuild(settings: GuildSettings): Promise<void>;

  // tickets
  createTicket(t: TicketRecord): Promise<void>;
  getTicket(channelId: string): Promise<TicketRecord | null>;
  updateTicket(channelId: string, patch: Partial<TicketRecord>): Promise<TicketRecord | null>;
  deleteTicket(channelId: string): Promise<void>;
  listTicketsByType(guildId: string, type: string): Promise<TicketRecord[]>;

  // orders
  createOrder(o: OrderRecord): Promise<void>;
  getOrder(id: string): Promise<OrderRecord | null>;
  updateOrder(id: string, patch: Partial<OrderRecord>): Promise<OrderRecord | null>;

  // ratings
  addRating(r: RatingRecord): Promise<void>;
  listRatings(designerId?: string): Promise<RatingRecord[]>;

  // prefix command logs
  addPrefixLog(l: PrefixLogRecord): Promise<void>;
  listPrefixLogs(guildId: string, limit: number): Promise<PrefixLogRecord[]>;

  // moderation / infractions / promotions
  addModRecord(r: ModRecord): Promise<void>;
  listModRecords(guildId: string, filter?: { targetId?: string; type?: ModRecordType }): Promise<ModRecord[]>;
}

export function defaultGuildSettings(guildId: string): GuildSettings {
  return {
    guildId,
    supportOpen: true,
    roles: {},
    channels: {},
    serviceStatus: {},
  };
}
