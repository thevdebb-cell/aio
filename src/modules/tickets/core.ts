import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  type OverwriteResolvable,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GuildSettings, TicketRecord } from "../../lib/store/types.js";
import { cid } from "../../lib/interactions.js";
import { container, text, e, ASSETS_DIR } from "../../lib/ui.js";
import { config } from "../../config/config.js";
import { log } from "../../lib/logger.js";

/** All Components V2 messages carry this flag. */
export const V2 = MessageFlags.IsComponentsV2;

/** Roles created by !setup, referenced by logical key. */
export const ROLE = {
  highrank: "highrank",
  support: "support",
  qc: "qc",
  quarantine: "quarantine",
  designer: (type: string) => `designer_${type}`,
} as const;

/** Channels created by !setup, referenced by logical key. */
export const CHANNEL = {
  logs: "logs",
  orderLogs: "order_logs",
  qc: "quality_control",
  dispute: "dispute",
  reviews: "reviews",
  quarantine: "quarantine",
  transcripts: "transcripts",
  ticketCategory: "ticket_category",
  orderCategory: "order_category",
} as const;

export function sanitize(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "user"
  );
}

/** Channel name for a support ticket: "<category>-<user>". */
export function supportChannelName(categoryPrefix: string, username: string): string {
  return `${categoryPrefix}-${sanitize(username)}`.slice(0, 90);
}

/**
 * Order ticket channel name.
 * Unclaimed: "<emoji> • <type>-<user>"
 * Claimed:   "<emoji> • <type>-<designer>-<queue>"
 * NOTE: the unclaimed/claimed emojis must be UNICODE (no-entry / green circle);
 * Discord channel names cannot render custom server emojis.
 */
export function orderChannelName(opts: {
  claimed: boolean;
  type: string;
  user: string;
  designer?: string;
  queue?: number;
}): string {
  const emoji = opts.claimed ? e(config.emojis.orderClaimed) : e(config.emojis.orderUnclaimed);
  const lead = emoji ? `${emoji}ㆍ` : "";
  if (opts.claimed) {
    const tail = opts.queue !== undefined ? `-${opts.queue}` : "";
    return `${lead}${opts.type}-${sanitize(opts.designer ?? "designer")}${tail}`.slice(0, 90);
  }
  return `${lead}${opts.type}-${sanitize(opts.user)}`.slice(0, 90);
}

/** Permission overwrites for a ticket, depending on claim state. */
export function ticketOverwrites(opts: {
  guild: Guild;
  settings: GuildSettings;
  buyerId: string;
  staffRoleKeys: string[]; // roles that may see while UNCLAIMED
  claimerId?: string | null; // when set, ticket is claimed -> lock to claimer
  extraUserIds?: string[]; // users added via /ticket add
}): OverwriteResolvable[] {
  const { guild, settings, buyerId, staffRoleKeys, claimerId, extraUserIds } = opts;
  const seeSend = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
  ];
  const ow: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: buyerId, allow: seeSend },
  ];

  const hr = settings.roles[ROLE.highrank];
  if (hr) ow.push({ id: hr, allow: seeSend });

  if (claimerId) {
    ow.push({ id: claimerId, allow: seeSend });
  } else {
    for (const key of staffRoleKeys) {
      const roleId = settings.roles[key];
      if (roleId) ow.push({ id: roleId, allow: seeSend });
    }
  }

  for (const uid of extraUserIds ?? []) {
    ow.push({ id: uid, allow: seeSend });
  }
  return ow;
}

/** The control panel shown inside every ticket. Staff act on it; the opener cannot. */
export function ticketControls(claimed: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (!claimed) {
    row.addComponents(
      new ButtonBuilder().setCustomId(cid("ticket", "claim")).setLabel("Claim").setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(cid("ticket", "unclaim")).setLabel("Unclaim").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(cid("ticket", "close")).setLabel("Close").setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(cid("ticket", "cancel")).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );
  return row;
}

function bannerFile(name: string): AttachmentBuilder[] {
  if (!name) return [];
  const p = join(ASSETS_DIR, name);
  return existsSync(p) ? [new AttachmentBuilder(p, { name })] : [];
}

/** DM the ticket opener that their ticket was claimed, with a jump button. */
export async function dmClaimed(member: GuildMember, channel: TextChannel, claimerTag: string) {
  const note = e(config.emojis.notification);
  const c = container();
  if (config.banners.ticketClaimedDm && bannerFile(config.banners.ticketClaimedDm).length) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${config.banners.ticketClaimedDm}`),
      ),
    );
  }
  c.addTextDisplayComponents(
    text(`${note ? note + " " : ""}Your ticket has been claimed by **${claimerTag}**.`),
  );
  const jump = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Jump to ticket").setStyle(ButtonStyle.Link).setURL(channel.url),
  );

  try {
    await member.send({
      flags: V2,
      components: [c, jump],
      files: bannerFile(config.banners.ticketClaimedDm),
    });
  } catch {
    log.debug(`[tickets] could not DM ${member.id} (DMs closed)`);
  }
}

export type { TicketRecord };
