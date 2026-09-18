import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type TextChannel,
} from "discord.js";
import { store } from "../../lib/store/store.js";
import { onButton, cid } from "../../lib/interactions.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
const V2 = V2FLAG;
import { CHANNEL, ROLE } from "../tickets/core.js";
import { buildTranscript } from "../tickets/transcript.js";
import { reviewButton } from "./ratings.js";
import { logOrder } from "./panel.js";
import { log } from "../../lib/logger.js";

const DISPUTE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h after delivery

// ── Confirm my order ────────────────────────────────────
onButton("orderconfirm", async (i: ButtonInteraction, parts) => {
  const [, action, orderId] = parts;
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  if (i.user.id !== order.buyerId) return void i.reply({ content: "Only the buyer can confirm.", ephemeral: true });

  if (action === "start") {
    if (order.buyerConfirmed) return void i.reply({ content: "This order is already confirmed.", ephemeral: true });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Yes, confirm").setCustomId(cid("orderconfirm", "yes", orderId!)),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Cancel").setCustomId(cid("orderconfirm", "cancel", orderId!)),
    );
    await i.reply({
      flags: V2FLAG,
      components: [
        container().addTextDisplayComponents(
          text("## Confirm Your Order"),
          text("Are you sure\nOnce confirmed the Star Customs team can no longer change or refund this order"),
        ),
        row,
      ],
      ephemeral: true,
    });
    return;
  }

  if (action === "cancel") {
    await i.update({ components: [], content: "Cancelled — your order is not confirmed yet." });
    return;
  }

  if (action === "yes") {
    await store().updateOrder(orderId!, { buyerConfirmed: true, status: "confirmed", confirmedAt: Date.now() });
    // Notify the designer.
    if (order.designerId && i.guild) {
      const d = await i.guild.members.fetch(order.designerId).catch(() => null);
      if (d)
        await d
          .send({ flags: V2, components: [container().addTextDisplayComponents(text("## Order Confirmed"), text(`Order ${orderId} was confirmed by the buyer`))] })
          .catch(() => {});
    }
    if (i.guild) await logOrder(i.guild, await store().getGuild(i.guild.id), `Order **${orderId}** confirmed by the buyer`);
    await i.update({
      flags: V2FLAG,
      components: [
        container().addTextDisplayComponents(text("## Confirmed"), text("Thank you\nYou can leave a review below")),
        new ActionRowBuilder<ButtonBuilder>().addComponents(reviewButton(orderId!)),
      ],
    });
    return;
  }
});

// ── Disputes ────────────────────────────────────────────
onButton("orderdispute", async (i: ButtonInteraction, parts) => {
  const [, action, orderId] = parts;
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  if (i.user.id !== order.buyerId) return void i.reply({ content: "Only the buyer can open a dispute.", ephemeral: true });

  if (action === "open") {
    if (order.buyerConfirmed) {
      await i.reply({ content: "You already confirmed this order, so it can't be disputed.", ephemeral: true });
      return;
    }
    const since = order.deliveredAt ?? order.createdAt;
    const openAt = since + DISPUTE_WINDOW_MS;
    if (Date.now() < openAt) {
      await i.reply({ content: `A dispute can be opened <t:${Math.floor(openAt / 1000)}:R> (12 hours after delivery).`, ephemeral: true });
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel("Open dispute").setCustomId(cid("orderdispute", "confirm", orderId!)),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Cancel").setCustomId(cid("orderdispute", "cancel", orderId!)),
    );
    await i.reply({
      flags: V2FLAG,
      components: [container().addTextDisplayComponents(text("## Open A Dispute"), text("The ticket will be locked and reviewed by the Star Customs team\nContinue")), row],
      ephemeral: true,
    });
    return;
  }

  if (action === "cancel") {
    await i.update({ components: [], content: "Cancelled." });
    return;
  }

  if (action === "confirm" && i.guild) {
    await store().updateOrder(orderId!, { status: "dispute" });
    const chan = await i.guild.channels.fetch(order.channelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      const tc = chan as TextChannel;
      // Freeze the channel: nobody but High Rank can send.
      await tc.permissionOverwrites.edit(order.buyerId, { SendMessages: false }).catch(() => {});
      if (order.designerId) await tc.permissionOverwrites.edit(order.designerId, { SendMessages: false }).catch(() => {});
      await tc.send({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Dispute Opened"), text("This order is now under dispute\nDo not delete anything\nThe Star Customs team will review the messages"))] });

      // Transcript to the dispute channel.
      const ticket = await store().getTicket(tc.id);
      const settings = await store().getGuild(i.guild.id);
      const dId = settings.channels[CHANNEL.dispute];
      if (dId && ticket) {
        const dc = await i.guild.channels.fetch(dId).catch(() => null);
        if (dc && dc.type === ChannelType.GuildText) {
          const file = await buildTranscript(tc, ticket);
          await (dc as TextChannel).send({
            content: `Dispute — order ${orderId} — buyer <@${order.buyerId}> — designer ${order.designerId ? `<@${order.designerId}>` : "—"}`,
            files: [file],
          });
        }
      }
    }
    await i.update({ components: [], content: "Your dispute has been opened. The team will review it." });
    log.info(`[orders] dispute opened for ${orderId}`);
    return;
  }
});
