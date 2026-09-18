import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type TextChannel,
} from "discord.js";
import type { PrefixCommand } from "../../lib/framework.js";
import { out } from "../../lib/msg.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { store } from "../../lib/store/store.js";
import { config, serviceByKey } from "../../config/config.js";
import type { GuildSettings } from "../../lib/store/types.js";
import type { ServiceStatus } from "../../types/types.js";
import { ROLE, CHANNEL } from "../../modules/tickets/core.js";
import { buildSupportPanel } from "../../modules/support/panel.js";
import { buildOrderPanel } from "../../modules/orders/panel.js";
import { STATUS } from "../../modules/orders/status.js";
import { log } from "../../lib/logger.js";

// ── !setup ──────────────────────────────────────────────
const setup: PrefixCommand = {
  name: "setup",
  description: "Create all roles and channels the bot needs",
  ownerOnly: true,
  execute: async (message) => {
    const guild = message.guild;
    if (!guild) return;
    await out(message).send({ content: "Running setup — creating roles and channels…" });
    const settings = await store().getGuild(guild.id);

    const created: string[] = [];

    // Roles
    const roleSpecs: { key: string; name: string }[] = [
      { key: ROLE.highrank, name: "High Rank" },
      { key: ROLE.support, name: "Support Team" },
      { key: ROLE.qc, name: "Quality Control" },
      { key: ROLE.quarantine, name: "Quarantine" },
    ];
    for (const s of config.services) roleSpecs.push({ key: ROLE.designer(s.key), name: `${s.name.replace(/ Development$/, "")} Designer` });

    for (const spec of roleSpecs) {
      if (!resolveRole(guild, settings.roles[spec.key])) {
        const role = await guild.roles.create({ name: spec.name, reason: "AIO setup" }).catch(() => null);
        if (role) {
          settings.roles[spec.key] = role.id;
          created.push(`role @${role.name}`);
        }
      }
    }

    // Staff view for staff-only channels.
    const staffAllow = [settings.roles[ROLE.highrank], settings.roles[ROLE.support], settings.roles[ROLE.qc]].filter(Boolean) as string[];

    // Categories
    const ticketCat = await ensureCategory(guild, settings, CHANNEL.ticketCategory, "Tickets", created);
    const orderCat = await ensureCategory(guild, settings, CHANNEL.orderCategory, "Orders", created);

    // Staff-only text channels
    await ensureStaffChannel(guild, settings, CHANNEL.logs, "logs", staffAllow, created);
    await ensureStaffChannel(guild, settings, CHANNEL.orderLogs, "order-logs", [settings.roles[ROLE.highrank]].filter(Boolean) as string[], created);
    await ensureStaffChannel(guild, settings, CHANNEL.qc, "quality-control", [settings.roles[ROLE.qc], settings.roles[ROLE.highrank]].filter(Boolean) as string[], created);
    await ensureStaffChannel(guild, settings, CHANNEL.dispute, "disputes", [settings.roles[ROLE.highrank]].filter(Boolean) as string[], created);
    await ensureStaffChannel(guild, settings, CHANNEL.transcripts, "transcripts", staffAllow, created);
    await ensureStaffChannel(guild, settings, CHANNEL.reviews, "reviews", staffAllow, created);

    // Quarantine channel + lockdown for the quarantine role.
    const qRole = settings.roles[ROLE.quarantine];
    if (qRole) {
      await ensureQuarantineChannel(guild, settings, qRole, staffAllow, created);
      await lockdownQuarantineRole(guild, qRole, settings.channels[CHANNEL.quarantine]);
    }

    await store().saveGuild(settings);

    const c = container().addTextDisplayComponents(
      text("## Setup complete"),
      text(created.length ? created.map((x) => `• ${x}`).join("\n") : "Everything was already in place."),
      text("Now run `!sendsupportpanel` and `!sendorderpanel` in the channels where you want the panels."),
    );
    await out(message).send({ flags: V2FLAG, components: [c] });
    log.info(`[setup] done for ${guild.name} (${created.length} created)`);
  },
};

// ── !sendsupportpanel / !sendorderpanel ─────────────────
const sendSupportPanel: PrefixCommand = {
  name: "sendsupportpanel",
  description: "Post the assistance panel in this channel",
  ownerOnly: true,
  execute: async (message) => {
    const { components, files } = buildSupportPanel();
    await out(message).send({ flags: V2FLAG, components, files });
    await message.delete().catch(() => {});
  },
};

const sendOrderPanel: PrefixCommand = {
  name: "sendorderpanel",
  description: "Post the order panel in this channel",
  ownerOnly: true,
  execute: async (message) => {
    if (!message.guild) return;
    const { components, files } = await buildOrderPanel(message.guild.id);
    await out(message).send({ flags: V2FLAG, components, files });
    await message.delete().catch(() => {});
  },
};

// ── !supporton / !supportoff ────────────────────────────
const supportOn: PrefixCommand = {
  name: "supporton",
  description: "Open support",
  ownerOnly: true,
  execute: async (message) => {
    if (!message.guild) return;
    const s = await store().getGuild(message.guild.id);
    s.supportOpen = true;
    await store().saveGuild(s);
    await out(message).send({ content: "Support is now **open**." });
  },
};

const supportOff: PrefixCommand = {
  name: "supportoff",
  description: "Close support",
  ownerOnly: true,
  execute: async (message) => {
    if (!message.guild) return;
    const s = await store().getGuild(message.guild.id);
    s.supportOpen = false;
    await store().saveGuild(s);
    await out(message).send({ content: "Support is now **closed**. New tickets are blocked." });
  },
};

// ── !prefixlogs ─────────────────────────────────────────
const prefixLogs: PrefixCommand = {
  name: "prefixlogs",
  description: "Show recent ! commands run by staff",
  ownerOnly: true,
  execute: async (message) => {
    if (!message.guild) return;
    const logs = await store().listPrefixLogs(message.guild.id, 20);
    const body = logs.length
      ? logs
          .map((l) => `<t:${Math.floor(l.createdAt / 1000)}:t> <@${l.userId}> \`${l.raw}\` in <#${l.channelId}>`)
          .join("\n")
      : "No prefix commands logged yet.";
    const c = container().addTextDisplayComponents(text("## Prefix command logs"), text(body));
    await out(message).send({ flags: V2FLAG, components: [c] });
  },
};

// ── !service <key> <status> ─────────────────────────────
const STATUS_ALIASES: Record<string, ServiceStatus> = {
  on: "on",
  online: "on",
  delay: "delay",
  delayed: "delay",
  closed: "closed",
  offline: "closed",
  unavail: "unavail",
  unavailable: "unavail",
};

const service: PrefixCommand = {
  name: "service",
  description: "Set a service status: !service <service> <on|delay|closed|unavail>",
  whitelistOnly: true,
  execute: async (message, args) => {
    if (!message.guild) return;
    const key = (args[0] ?? "").toLowerCase();
    const statusRaw = (args[1] ?? "").toLowerCase();
    const def = serviceByKey(key);
    const status = STATUS_ALIASES[statusRaw];
    if (!def || !status) {
      const services = config.services.map((s) => s.key).join(", ");
      await out(message).send({
        content: `Usage: \`!service <service> <on|delay|closed|unavail>\`\nServices: ${services}`,
      });
      return;
    }
    const s = await store().getGuild(message.guild.id);
    s.serviceStatus[key] = status;
    await store().saveGuild(s);
    await out(message).send({
      content: `**${def.name}** is now **${STATUS[status].label}**. Re-run \`!sendorderpanel\` to refresh a posted panel.`,
    });
  },
};

// ── helpers ─────────────────────────────────────────────
function resolveRole(guild: Guild, id?: string) {
  return id ? guild.roles.cache.get(id) : undefined;
}
function resolveChannel(guild: Guild, id?: string) {
  return id ? guild.channels.cache.get(id) : undefined;
}

async function ensureCategory(guild: Guild, settings: GuildSettings, key: string, name: string, created: string[]): Promise<CategoryChannel | null> {
  const existing = resolveChannel(guild, settings.channels[key]);
  if (existing && existing.type === ChannelType.GuildCategory) return existing as CategoryChannel;
  const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "AIO setup" }).catch(() => null);
  if (cat) {
    settings.channels[key] = cat.id;
    created.push(`category ${name}`);
  }
  return cat;
}

async function ensureStaffChannel(guild: Guild, settings: GuildSettings, key: string, name: string, allowRoleIds: string[], created: string[]) {
  if (resolveChannel(guild, settings.channels[key])) return;
  const chan = await guild.channels
    .create({
      name,
      type: ChannelType.GuildText,
      reason: "AIO setup",
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...allowRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
    })
    .catch(() => null);
  if (chan) {
    settings.channels[key] = chan.id;
    created.push(`channel #${name}`);
  }
}

async function ensureQuarantineChannel(guild: Guild, settings: GuildSettings, quarantineRoleId: string, staffAllow: string[], created: string[]) {
  if (resolveChannel(guild, settings.channels[CHANNEL.quarantine])) return;
  const chan = await guild.channels
    .create({
      name: "quarantine",
      type: ChannelType.GuildText,
      reason: "AIO setup",
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: quarantineRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        ...staffAllow.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
    })
    .catch(() => null);
  if (chan) {
    settings.channels[CHANNEL.quarantine] = chan.id;
    created.push("channel #quarantine");
  }
}

/** Deny the quarantine role from viewing every channel except the quarantine channel. */
async function lockdownQuarantineRole(guild: Guild, quarantineRoleId: string, quarantineChannelId?: string) {
  for (const chan of guild.channels.cache.values()) {
    if (chan.id === quarantineChannelId) continue;
    if (chan.type === ChannelType.GuildCategory) continue;
    if (!("permissionOverwrites" in chan)) continue;
    await chan.permissionOverwrites
      .edit(quarantineRoleId, { ViewChannel: false }, { reason: "AIO quarantine lockdown" })
      .catch(() => {});
  }
}

export const adminPrefix: PrefixCommand[] = [
  setup,
  sendSupportPanel,
  sendOrderPanel,
  supportOn,
  supportOff,
  prefixLogs,
  service,
];
