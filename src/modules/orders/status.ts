import { config, serviceByKey } from "../../config/config.js";
import type { GuildSettings } from "../../lib/store/types.js";
import type { ServiceDef, ServiceStatus } from "../../types/types.js";
import { e } from "../../lib/ui.js";

export interface StatusMeta {
  label: string; // shown in the panel
  emojiKey: keyof typeof config.emojis;
  selectable: boolean; // can a buyer pick it in the dropdown?
}

export const STATUS: Record<ServiceStatus, StatusMeta> = {
  on: { label: "Online", emojiKey: "wifiOnline", selectable: true },
  delay: { label: "Delayed", emojiKey: "wifiDelayed", selectable: true },
  closed: { label: "Offline", emojiKey: "wifiOffline", selectable: true }, // selectable, but shows a "closed" notice
  unavail: { label: "Unavailable", emojiKey: "wifiDev", selectable: false },
};

/** Merge config defaults with live per-guild overrides set by !service. */
export function resolvedServices(settings: GuildSettings): ServiceDef[] {
  return config.services.map((s) => ({
    ...s,
    status: settings.serviceStatus[s.key] ?? s.status,
  }));
}

export function statusLine(s: ServiceDef): string {
  const meta = STATUS[s.status];
  const emoji = e(config.emojis[meta.emojiKey]);
  return `${s.name}: ${emoji ? emoji + " " : ""}${meta.label}`;
}

export function statusOf(settings: GuildSettings, key: string): ServiceStatus | null {
  const def = serviceByKey(key);
  if (!def) return null;
  return settings.serviceStatus[key] ?? def.status;
}
