import {
  ActionRowBuilder,
  type AttachmentBuilder,
  AttachmentBuilder as AB,
  ChannelType,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type Guild,
  type TextChannel,
} from "discord.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { onSelect, onModal, cid } from "../../lib/interactions.js";
import { container, text, separator, banner, bannerFiles, bannerExists, e, ASSETS_DIR } from "../../lib/ui.js";
import { config } from "../../config/config.js";
import { store, newOrderId } from "../../lib/store/store.js";
import type { OrderTicketType } from "../../types/types.js";
import { V2, CHANNEL, ROLE, orderChannelName, ticketControls } from "../tickets/core.js";
import { createTicketChannel } from "../tickets/create.js";
import { resolvedServices, statusLine, statusOf, STATUS, DEFAULT_STARPLUS_ROLE_ID } from "./status.js";
import { log } from "../../lib/logger.js";
import type { GuildSettings } from "../../lib/store/types.js";

/** Build the order/services panel (Components V2, black, two banners). */
export async function buildOrderPanel(guildId: string): Promise<{ components: [ReturnType<typeof container>]; files: AttachmentBuilder[] }> {
  const settings = await store().getGuild(guildId);
  const services = resolvedServices(settings);

  const c = container();
  if (bannerExists(config.banners.orderTop)) c.addMediaGalleryComponents(banner(config.banners.orderTop));

  c.addTextDisplayComponents(
    text("# Star Customs — Services"),
    text(
      "Welcome to the **Star Customs** order desk. We bring your ideas to life — clean, " +
        "professional and on time. Check the live status of each service below, then open " +
        "an order and tell us exactly what you need.",
    ),
  );
  c.addSeparatorComponents(separator(true));

  c.addTextDisplayComponents(text("## Order Status"), text(services.map(statusLine).join("\n")));
  c.addSeparatorComponents(separator(true));

  // Status legend (uses your wifi emojis when set)
  const legend = [
    `${e(config.emojis.wifiOnline)} **Online** — available to order now`,
    `${e(config.emojis.wifiDelayed)} **Star Plus** — reserved for Star Plus members`,
    `${e(config.emojis.wifiOffline)} **Offline** — temporarily closed, try again later`,
    `${e(config.emojis.wifiDev)} **Unavailable** — not offered right now`,
  ].map((l) => l.trimStart());
  c.addTextDisplayComponents(text("## Legend"), text(legend.join("\n")));
  c.addSeparatorComponents(separator(true));

  c.addTextDisplayComponents(
    text("## How To Order"),
    text(
      "Pick a service in the menu below and fill in the short form (add your references — " +
        "especially for graphics). A private order channel is created for you, a designer " +
        "claims it, and everything is tracked with a unique order ID from start to delivery.",
    ),
  );
  c.addSeparatorComponents(separator());

  const options = services
    .filter((s) => STATUS[s.status].selectable)
    .map((s) =>
      new StringSelectMenuOptionBuilder().setLabel(s.name).setDescription(STATUS[s.status].label).setValue(s.key),
    );

  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("order", "open"))
        .setPlaceholder("Select a service to open an order")
        .addOptions(options.length ? options : [new StringSelectMenuOptionBuilder().setLabel("No services available").setValue("none")]),
    ),
  );
  if (bannerExists(config.banners.orderBottom)) c.addMediaGalleryComponents(banner(config.banners.orderBottom));

  return { components: [c], files: bannerFiles(config.banners.orderTop, config.banners.orderBottom) };
}

// ── Select a service ────────────────────────────────────
onSelect("order", async (i: StringSelectMenuInteraction) => {
  if (!i.guild) return;
  const key = i.values[0]!;
  if (key === "none") {
    await i.reply({ content: "No services are available to order right now.", ephemeral: true });
    return;
  }

  const settings = await store().getGuild(i.guild.id);
  const status = statusOf(settings, key);
  if (!status || status === "unavail") {
    await i.reply({ content: "That service is unavailable and can't be ordered.", ephemeral: true });
    return;
  }
  if (status === "closed") {
    await i.reply({ content: "This service is currently **offline**. Please try again later.", ephemeral: true });
    return;
  }
  if (status === "starplus") {
    const roleId = config.starPlusRoleId || DEFAULT_STARPLUS_ROLE_ID;
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member || !member.roles.cache.has(roleId)) {
      await i.reply({ content: "This service is **Star Plus** only — you need the Star Plus role to open it.", ephemeral: true });
      return;
    }
  }

  const service = resolvedServices(settings).find((s) => s.key === key)!;
  const modal = new ModalBuilder().setCustomId(cid("order", "submit", key)).setTitle(`Order — ${service.name}`);
  const refRequired = key === "graphic";
  modal.addComponents(
    row(new TextInputBuilder().setCustomId("details").setLabel("What do you need?").setStyle(TextInputStyle.Paragraph).setRequired(true)),
    row(
      new TextInputBuilder()
        .setCustomId("references")
        .setLabel(refRequired ? "References (required)" : "References (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(refRequired),
    ),
  );
  await i.showModal(modal);
});

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

// ── Create the order ────────────────────────────────────
onModal("order", async (i: ModalSubmitInteraction, parts) => {
  if (parts[1] !== "submit" || !i.guild) return;
  const key = parts[2] as OrderTicketType;

  const settings = await store().getGuild(i.guild.id);
  const status = statusOf(settings, key);
  if (!status || status === "unavail" || status === "closed") {
    await i.reply({ content: "This service can't be ordered right now.", ephemeral: true });
    return;
  }

  await i.deferReply({ ephemeral: true });

  const details = getField(i, "details");
  const references = getField(i, "references");
  const orderId = newOrderId();

  const channel = await createTicketChannel({
    guild: i.guild,
    settings,
    name: orderChannelName({ claimed: false, type: key, user: i.user.username }),
    parentKey: CHANNEL.orderCategory,
    buyerId: i.user.id,
    staffRoleKeys: [ROLE.designer(key)],
    topic: `Order ${orderId} — ${key} — ${i.user.tag}`,
  });

  await store().createOrder({
    id: orderId,
    guildId: i.guild.id,
    channelId: channel.id,
    type: key,
    buyerId: i.user.id,
    designerId: null,
    status: "open",
    references: references || null,
    createdAt: Date.now(),
    claimedAt: null,
    deliveredAt: null,
    confirmedAt: null,
    submissions: [],
  });

  await store().createTicket({
    channelId: channel.id,
    guildId: i.guild.id,
    kind: "order",
    type: key,
    ownerId: i.user.id,
    claimedBy: null,
    claimId: ROLE.designer(key),
    createdAt: Date.now(),
    addedUsers: [],
    orderId,
  });

  // Intro (Components V2, black).
  const c = container();
  c.addTextDisplayComponents(text(`## Order ${orderId}`), text(`Service: **${key}** — opened by <@${i.user.id}>.`));
  c.addSeparatorComponents(separator());
  const lines = [`**Details:**\n${details}`];
  if (references) lines.push(`**References:**\n${references}`);
  if (status === "starplus") lines.push(`This is a **Star Plus** order.`);
  c.addTextDisplayComponents(text(lines.join("\n")));

  await channel.send({ flags: V2, components: [c] });
  await channel.send({ components: [ticketControls(false)] });

  // Log to the order-logs channel (staff-only, created by setup).
  await logOrder(i.guild, settings, `Order **${orderId}** opened by ${i.user.tag} — service **${key}** — status: open`);

  // DM the buyer a confirmation with banner.
  await dmOrderCreated(i.user.id, i.guild, orderId, key);

  await i.editReply({ content: `Your order has been created: <#${channel.id}> — ID \`${orderId}\`` });
  log.debug(`[orders] ${key} order ${orderId} opened by ${i.user.tag}`);
});

function getField(i: ModalSubmitInteraction, id: string): string {
  try {
    return i.fields.getTextInputValue(id).trim();
  } catch {
    return "";
  }
}

export async function logOrder(guild: Guild, settings: GuildSettings, message: string) {
  const chanId = settings.channels[CHANNEL.orderLogs];
  if (!chanId) return;
  const chan = await guild.channels.fetch(chanId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    await (chan as TextChannel).send({ flags: V2, components: [container().addTextDisplayComponents(text(message))] }).catch(() => {});
  }
}

async function dmOrderCreated(userId: string, guild: Guild, orderId: string, type: string) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const c = container();
  const bannerName = config.banners.orderCreatedDm;
  const files: AttachmentBuilder[] = [];
  if (bannerName && existsSync(join(ASSETS_DIR, bannerName))) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerName}`)));
    files.push(new AB(join(ASSETS_DIR, bannerName), { name: bannerName }));
  }
  c.addTextDisplayComponents(
    text(`## Order Created`),
    text(`Your **${type}** order has been created.\nOrder ID: \`${orderId}\`\nWe'll keep you posted here and in your ticket.`),
  );
  await member.send({ flags: V2, components: [c], files }).catch(() => {});
}
