import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";

export const sendgp: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("sendgp")
    .setDescription("Designer: post the gamepass link in this order ticket")
    .addStringOption((o) => o.setName("link").setDescription("Gamepass link").setRequired(true)),
  execute: async (i) => {
    if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this inside an order ticket.", ephemeral: true });
      return;
    }
    const channel = i.channel as TextChannel;
    const ticket = await store().getTicket(channel.id);
    if (!ticket || ticket.kind !== "order") {
      await i.reply({ content: "This isn't an order ticket.", ephemeral: true });
      return;
    }
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    const allowed = memberHasAnyRole(member, settings, [ROLE.designer(ticket.type)]) || ticket.claimedBy === i.user.id;
    if (!allowed) {
      await i.reply({ content: "Only the designer on this order can send the gamepass.", ephemeral: true });
      return;
    }
    const link = i.options.getString("link", true).trim();
    const c = container().addTextDisplayComponents(text("## Gamepass"), text(`Please purchase the gamepass below\n${link}`));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open gamepass").setURL(link),
    );
    await channel.send({ flags: V2FLAG, components: [c, row] }).catch(async () => {
      // invalid URL for a link button -> post as text only
      await channel.send({ flags: V2FLAG, components: [c] });
    });
    await i.reply({ content: "Gamepass link posted.", ephemeral: true });
  },
};
