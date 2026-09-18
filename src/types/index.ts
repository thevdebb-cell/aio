// ── Shared domain types ─────────────────────────────────

export type ServiceStatus = "on" | "delay" | "closed" | "unavail";

export interface ServiceDef {
  /** stable key used by !service and internally (e.g. "graphic") */
  key: string;
  /** human label shown in the panel (e.g. "Graphic Development") */
  name: string;
  status: ServiceStatus;
}

export interface Config {
  owners: string[];
  whitelist: string[];
  links: {
    dashboard: string;
    assistance: string;
    order: string;
  };
  welcome: {
    channelId: string;
  };
  emojis: {
    orderUnclaimed: string;
    orderClaimed: string;
    wifiOnline: string;
    wifiDelayed: string;
    wifiOffline: string;
    wifiDev: string;
    star: string;
    notification: string;
    memberCount: string;
  };
  banners: {
    assistanceTop: string;
    assistanceBottom: string;
    orderTop: string;
    orderBottom: string;
    welcomeDm: string;
    ticketClaimedDm: string;
    orderCreatedDm: string;
    orderReadyDm: string;
    ratingDm: string;
  };
  services: ServiceDef[];
}

// ── Support tickets ─────────────────────────────────────

export type SupportCategory =
  | "general"
  | "order"
  | "highrank"
  | "report"
  | "bug";

// ── Order tickets ───────────────────────────────────────

export type OrderTicketType =
  | "discord"
  | "clothing"
  | "graphic"
  | "els";

export type OrderStatus =
  | "open"
  | "claimed"
  | "submitted"
  | "qc_review"
  | "delivered"
  | "confirmed"
  | "dispute"
  | "cancelled";

export interface OrderRecord {
  id: string;
  guildId: string;
  channelId: string;
  type: OrderTicketType;
  buyerId: string;
  designerId: string | null;
  status: OrderStatus;
  references: string | null;
  createdAt: number;
  claimedAt: number | null;
  deliveredAt: number | null;
  confirmedAt: number | null;
}
