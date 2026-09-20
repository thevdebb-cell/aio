import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";

export const lockreview: SlashCommand = {
  data: new SlashCommandBuilder().setName("lockreview").setDescription("Staff: lock this order ticket for review"),
  execute: async (i) => {
    if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this inside an order ticket.", ephemeral: true });
      return;
    }
    const channel = i.channel as TextChannel;
    const ticket = await store().getTicket(channel.id);
    if (!ticket || ticket.kind !== "order") {
      await i.reply({ content: "This is for order tickets only.", ephemeral: true });
      return;
    }
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    if (!memberHasAnyRole(member, settings, [ROLE.support])) {
      await i.reply({ content: "Staff only.", ephemeral: true });
      return;
    }

    await i.deferReply({ ephemeral: true });
    // Freeze the channel: only the runner can speak.
    await channel.permissionOverwrites.edit(i.guild.roles.everyone.id, { SendMessages: false }).catch(() => {});
    if (ticket.ownerId) await channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false }).catch(() => {});
    if (ticket.claimedBy) await channel.permissionOverwrites.edit(ticket.claimedBy, { SendMessages: false }).catch(() => {});
    await channel.permissionOverwrites.edit(i.user.id, { SendMessages: true, ViewChannel: true }).catch(() => {});

    // Non-embed notice.
    await channel.send({ content: "order is currently under review" }).catch(() => {});
    await i.editReply({ content: "Ticket locked for review — only you can speak now." });
  },
};
