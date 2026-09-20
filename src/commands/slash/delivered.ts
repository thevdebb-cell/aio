import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { markDelivered } from "../../modules/orders/flow.js";

export const delivered: SlashCommand = {
  data: new SlashCommandBuilder().setName("delivered").setDescription("Designer: mark this order as delivered"),
  execute: async (i) => {
    if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this inside an order ticket.", ephemeral: true });
      return;
    }
    const channel = i.channel as TextChannel;
    const ticket = await store().getTicket(channel.id);
    if (!ticket || ticket.kind !== "order" || !ticket.orderId) {
      await i.reply({ content: "This isn't an order ticket.", ephemeral: true });
      return;
    }
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    const allowed = memberHasAnyRole(member, settings, [ROLE.designer(ticket.type)]) || ticket.claimedBy === i.user.id;
    if (!allowed) {
      await i.reply({ content: "Only the designer on this order can mark it delivered.", ephemeral: true });
      return;
    }
    const order = await store().getOrder(ticket.orderId);
    if (!order) {
      await i.reply({ content: "Linked order not found.", ephemeral: true });
      return;
    }
    await i.deferReply({ ephemeral: true });
    await markDelivered(i.guild, channel, order, i.user.id);
    await i.editReply({ content: "Marked as delivered — the buyer has been notified." });
  },
};
