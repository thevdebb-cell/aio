import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { store } from "../../lib/store/store.js";
import { onButton, onModal, cid } from "../../lib/interactions.js";
import { container, text, separator, V2FLAG } from "../../lib/ui.js";
import { V2, ROLE, CHANNEL } from "../tickets/core.js";
import { reviewButton } from "./ratings.js";
import { logOrder } from "./panel.js";
import { log } from "../../lib/logger.js";
import type { OrderRecord } from "../../types/types.js";

/** Post the "delivered" message in the ticket and DM the buyer (V1 flow). */
export async function markDelivered(guild: Guild, channel: TextChannel, order: OrderRecord, designerId: string) {
  await store().updateOrder(order.id, { status: "delivered", deliveredAt: Date.now(), designerId: order.designerId ?? designerId });

  // In-ticket message with confirm / not-conforme buttons (all grey).
  const c = container().addTextDisplayComponents(
    text("## Order Delivered"),
    text(`Order \`${order.id}\` has been delivered by <@${designerId}>`),
  );
  c.addSeparatorComponents(separator());
  c.addTextDisplayComponents(text("Please confirm you received it, or flag it if something is not right"));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Confirm reception").setCustomId(cid("orderv1", "confirm", order.id)),
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Not conforme").setCustomId(cid("orderv1", "notconform", order.id)),
  );
  await channel.send({ flags: V2FLAG, components: [c, row] });

  // DM the buyer with the same actions + report designer.
  const buyer = await guild.members.fetch(order.buyerId).catch(() => null);
  if (buyer) {
    const dc = container().addTextDisplayComponents(
      text("## Your Order Is Delivered"),
      text(`Order \`${order.id}\` from Star Customs is ready\nConfirm the reception below or report a problem`),
    );
    const drow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Confirm reception").setCustomId(cid("orderv1", "confirm", order.id)),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Not conforme").setCustomId(cid("orderv1", "notconform", order.id)),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Report designer").setCustomId(cid("orderv1", "report", order.id)),
    );
    await buyer.send({ flags: V2, components: [dc, drow] }).catch(() => {});
  }

  await logOrder(guild, await store().getGuild(guild.id), `Order **${order.id}** delivered by <@${designerId}>`);
}

// ── Buyer actions ───────────────────────────────────────
onButton("orderv1", async (i: ButtonInteraction, parts) => {
  const [, action, orderId] = parts;
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  if (i.user.id !== order.buyerId) return void i.reply({ content: "Only the buyer can use this.", ephemeral: true });
  if (!i.guild) {
    // pull the guild the order lives in
  }
  const guild = i.client.guilds.cache.get(order.guildId) ?? i.guild ?? null;

  if (action === "confirm") {
    await store().updateOrder(orderId!, { status: "confirmed", confirmedAt: Date.now(), buyerConfirmed: true });
    if (guild && order.designerId) {
      const d = await guild.members.fetch(order.designerId).catch(() => null);
      await d?.send({ flags: V2, components: [container().addTextDisplayComponents(text("## Order Confirmed"), text(`The buyer confirmed order \`${orderId}\``))] }).catch(() => {});
    }
    if (guild) await logOrder(guild, await store().getGuild(guild.id), `Order **${orderId}** confirmed by the buyer`);
    await i.update({
      flags: V2FLAG,
      components: [
        container().addTextDisplayComponents(text("## Confirmed"), text("Thank you\nYou can leave a review below")),
        new ActionRowBuilder<ButtonBuilder>().addComponents(reviewButton(orderId!)),
      ],
    }).catch(async () => {
      await i.reply({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Confirmed"), text("Thank you")), new ActionRowBuilder<ButtonBuilder>().addComponents(reviewButton(orderId!))], ephemeral: true });
    });
    return;
  }

  if (action === "notconform") {
    if (guild) await alertQualityControl(guild, order, i.user.id, "The buyer flagged this order as not conforme");
    await i.reply({ content: "The team has been alerted and will review your order shortly.", ephemeral: true });
    return;
  }

  if (action === "report") {
    const modal = new ModalBuilder().setCustomId(cid("orderv1", "reportmodal", orderId!)).setTitle("Report designer");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("What is the problem?").setStyle(TextInputStyle.Paragraph).setRequired(true),
      ),
    );
    await i.showModal(modal);
    return;
  }
});

onModal("orderv1", async (i: ModalSubmitInteraction, parts) => {
  if (parts[1] !== "reportmodal") return;
  const orderId = parts[2]!;
  const order = await store().getOrder(orderId);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  const guild = i.client.guilds.cache.get(order.guildId) ?? null;
  let reason = "";
  try {
    reason = i.fields.getTextInputValue("reason").trim();
  } catch {
    /* */
  }
  if (guild) await alertQualityControl(guild, order, i.user.id, `Designer reported by the buyer\nReason ${reason}`);
  await i.reply({ content: "Your report has been sent to the team.", ephemeral: true });
});

/** Make the order ticket visible to staff and post an alert with a jump button in QC. */
async function alertQualityControl(guild: Guild, order: OrderRecord, byId: string, headline: string) {
  const settings = await store().getGuild(guild.id);

  // Reveal the ticket to support + high rank so staff can review.
  const chan = await guild.channels.fetch(order.channelId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    const tc = chan as TextChannel;
    for (const key of [ROLE.support, ROLE.highrank, ROLE.qc]) {
      const roleId = settings.roles[key];
      if (roleId) await tc.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    }
    await tc.send({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Under Review"), text("This order was flagged and the team will review it"))] }).catch(() => {});
  }

  // Alert in the quality-control channel with a jump button.
  const qcId = settings.channels[CHANNEL.qc];
  if (qcId) {
    const qc = await guild.channels.fetch(qcId).catch(() => null);
    if (qc && qc.type === ChannelType.GuildText) {
      const c = container().addTextDisplayComponents(
        text("## Quality Control Alert"),
        text([`Order \`${order.id}\``, headline, `Buyer <@${order.buyerId}>`, `Designer ${order.designerId ? `<@${order.designerId}>` : "—"}`].join("\n")),
      );
      const jump = order.channelId
        ? new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jump to ticket").setURL(`https://discord.com/channels/${guild.id}/${order.channelId}`),
          )
        : null;
      await (qc as TextChannel).send({ flags: V2FLAG, components: jump ? [c, jump] : [c] }).catch(() => {});
    }
  }
  await logOrder(guild, settings, `Order **${order.id}** flagged for review by <@${byId}>`);
}

log.debug("[orders/flow] handlers registered");
