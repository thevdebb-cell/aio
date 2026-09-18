import {
  ActionRowBuilder,
  type AttachmentBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { onSelect, onModal, cid } from "../../lib/interactions.js";
import { container, text, separator, banner, bannerFiles, bannerExists, e } from "../../lib/ui.js";
import { config } from "../../config/config.js";
import { store } from "../../lib/store/store.js";
import type { SupportCategory } from "../../types/types.js";
import { V2, CHANNEL, ROLE, supportChannelName, ticketControls } from "../tickets/core.js";
import { createTicketChannel } from "../tickets/create.js";
import { log } from "../../lib/logger.js";

interface CatMeta {
  value: SupportCategory;
  label: string;
  description: string;
  prefix: string; // channel name prefix
  staffKeys: string[];
}

const CATEGORIES: CatMeta[] = [
  { value: "general", label: "General Support", description: "Questions and general help.", prefix: "general", staffKeys: [ROLE.support] },
  { value: "order", label: "Order Support", description: "Help with an existing order.", prefix: "order", staffKeys: [ROLE.support] },
  { value: "highrank", label: "High Rank Support", description: "Reach the management team.", prefix: "management", staffKeys: [ROLE.highrank] },
  { value: "report", label: "Report", description: "Report a user or an issue.", prefix: "report", staffKeys: [ROLE.support] },
  { value: "bug", label: "Bug Report", description: "Tell us about a bug.", prefix: "bug", staffKeys: [ROLE.support] },
];

function metaFor(value: string): CatMeta | undefined {
  return CATEGORIES.find((c) => c.value === value);
}

/** Build the assistance/support panel (Components V2, black, two banners). */
export function buildSupportPanel(): { components: [ReturnType<typeof container>]; files: AttachmentBuilder[] } {
  const c = container();
  if (bannerExists(config.banners.assistanceTop)) c.addMediaGalleryComponents(banner(config.banners.assistanceTop));

  c.addTextDisplayComponents(
    text("# Star Customs — Assistance"),
    text(
      "Welcome to the **Star Customs** support desk. Whatever you need — a question, " +
        "help with an order, reaching management, or reporting an issue — open a ticket " +
        "below and a member of the team will take care of you as soon as possible.",
    ),
  );
  c.addSeparatorComponents(separator(true));

  c.addTextDisplayComponents(
    text("## Support Categories"),
    text(
      [
        "**General Support** — questions, information, and anything that doesn't fit elsewhere.",
        "**Order Support** — help with an existing order (give your Order ID if you have one).",
        "**High Rank Support** — reach the management team directly for sensitive matters.",
        "**Report** — report a user, a staff member, or a problem on the server.",
        "**Bug Report** — tell us about a bug so we can fix it.",
      ].join("\n\n"),
    ),
  );
  c.addSeparatorComponents(separator(true));

  c.addTextDisplayComponents(
    text("## How It Works"),
    text(
      "Pick a category in the menu below and fill in the short form. A private channel is " +
        "created just for you and the team. Please stay patient and avoid pinging staff — " +
        "you'll be notified the moment your ticket is claimed.",
    ),
  );
  c.addSeparatorComponents(separator());

  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("support", "open"))
        .setPlaceholder("Select a support category to open a ticket")
        .addOptions(
          CATEGORIES.map((cat) =>
            new StringSelectMenuOptionBuilder().setLabel(cat.label).setDescription(cat.description).setValue(cat.value),
          ),
        ),
    ),
  );
  if (bannerExists(config.banners.assistanceBottom)) c.addMediaGalleryComponents(banner(config.banners.assistanceBottom));

  return { components: [c], files: bannerFiles(config.banners.assistanceTop, config.banners.assistanceBottom) };
}

// ── Select -> show the right modal ──────────────────────
onSelect("support", async (i: StringSelectMenuInteraction) => {
  if (!i.guild) return;

  // Respect !supportoff.
  const settings = await store().getGuild(i.guild.id);
  if (!settings.supportOpen) {
    await i.reply({ content: "Support is currently closed. Please try again later.", ephemeral: true });
    return;
  }

  const value = i.values[0]!;
  const meta = metaFor(value);
  if (!meta) return;

  const modal = new ModalBuilder().setCustomId(cid("support", "submit", value)).setTitle(meta.label);
  const rows: ActionRowBuilder<TextInputBuilder>[] = [];

  if (value === "general") {
    rows.push(
      row(new TextInputBuilder().setCustomId("roblox").setLabel("Roblox username").setStyle(TextInputStyle.Short).setRequired(false)),
      row(new TextInputBuilder().setCustomId("inquiry").setLabel("Inquiry").setStyle(TextInputStyle.Paragraph).setRequired(true)),
    );
  } else if (value === "order") {
    rows.push(
      row(new TextInputBuilder().setCustomId("orderId").setLabel("Order ID").setStyle(TextInputStyle.Short).setRequired(false)),
      row(new TextInputBuilder().setCustomId("inquiry").setLabel("Inquiry").setStyle(TextInputStyle.Paragraph).setRequired(true)),
    );
  } else if (value === "report") {
    rows.push(
      row(new TextInputBuilder().setCustomId("target").setLabel("Who / what are you reporting?").setStyle(TextInputStyle.Short).setRequired(true)),
      row(new TextInputBuilder().setCustomId("inquiry").setLabel("Details").setStyle(TextInputStyle.Paragraph).setRequired(true)),
    );
  } else {
    // highrank, bug
    rows.push(row(new TextInputBuilder().setCustomId("inquiry").setLabel("Inquiry").setStyle(TextInputStyle.Paragraph).setRequired(true)));
  }

  modal.addComponents(...rows);
  await i.showModal(modal);
});

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

// ── Modal submit -> create the ticket ───────────────────
onModal("support", async (i: ModalSubmitInteraction, parts) => {
  if (parts[1] !== "submit" || !i.guild) return;
  const value = parts[2] as SupportCategory;
  const meta = metaFor(value);
  if (!meta) return;

  const settings = await store().getGuild(i.guild.id);
  if (!settings.supportOpen) {
    await i.reply({ content: "Support is currently closed. Please try again later.", ephemeral: true });
    return;
  }

  await i.deferReply({ ephemeral: true });

  const inquiry = safeField(i, "inquiry");
  const roblox = safeField(i, "roblox");
  const orderId = safeField(i, "orderId");
  const target = safeField(i, "target");

  const channel = await createTicketChannel({
    guild: i.guild,
    settings,
    name: supportChannelName(meta.prefix, i.user.username),
    parentKey: CHANNEL.ticketCategory,
    buyerId: i.user.id,
    staffRoleKeys: meta.staffKeys,
    topic: `${meta.label} — opened by ${i.user.tag}`,
  });

  await store().createTicket({
    channelId: channel.id,
    guildId: i.guild.id,
    kind: "support",
    type: value,
    ownerId: i.user.id,
    claimedBy: null,
    claimId: meta.staffKeys[0] ?? null,
    createdAt: Date.now(),
    addedUsers: [],
    orderId: orderId || null,
  });

  // Intro message (Components V2, black, no footer).
  const c = container();
  c.addTextDisplayComponents(text(`## ${meta.label}`), text(`Opened by <@${i.user.id}>. A staff member will be with you shortly.`));
  c.addSeparatorComponents(separator());
  const details: string[] = [];
  if (roblox) details.push(`**Roblox username:** ${roblox}`);
  if (target) details.push(`**Report target:** ${target}`);
  if (orderId) {
    const order = await store().getOrder(orderId);
    details.push(`**Order ID:** ${orderId}${order ? ` — status: ${order.status}` : " (not found)"}`);
  }
  if (inquiry) details.push(`**Inquiry:**\n${inquiry}`);
  if (details.length) c.addTextDisplayComponents(text(details.join("\n")));

  await channel.send({ flags: V2, components: [c] });
  await channel.send({ components: [ticketControls(false)] });

  await i.editReply({ content: `Your ticket has been created: <#${channel.id}>` });
  log.debug(`[support] ${value} ticket opened by ${i.user.tag} -> #${channel.name}`);
});

function safeField(i: ModalSubmitInteraction, id: string): string {
  try {
    return i.fields.getTextInputValue(id).trim();
  } catch {
    return "";
  }
}
