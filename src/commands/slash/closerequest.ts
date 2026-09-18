import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/index.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { cid, onButton } from "../../lib/interactions.js";
import { CHANNEL } from "../../modules/tickets/core.js";
import { memberHasAnyRole, staffRoleKeysFor } from "../../modules/tickets/handlers.js";
import { buildTranscript } from "../../modules/tickets/transcript.js";
import { log } from "../../lib/logger.js";

export const closerequest: SlashCommand = {
  data: new SlashCommandBuilder().setName("closerequest").setDescription("Ask the ticket opener to approve closing"),
  execute: async (i) => {
    if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this inside a ticket.", ephemeral: true });
      return;
    }
    const channel = i.channel as TextChannel;
    const ticketRec = await store().getTicket(channel.id);
    if (!ticketRec) {
      await i.reply({ content: "This isn't a ticket.", ephemeral: true });
      return;
    }
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    if (!memberHasAnyRole(member, settings, staffRoleKeysFor(ticketRec))) {
      await i.reply({ content: "You can't manage this ticket.", ephemeral: true });
      return;
    }

    const c = container().addTextDisplayComponents(
      text("## Close request"),
      text(`<@${ticketRec.ownerId}>, the team has requested to close this ticket. Do you approve?`),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(cid("closereq", "accept", ticketRec.ownerId)).setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cid("closereq", "deny", ticketRec.ownerId)).setLabel("Deny").setStyle(ButtonStyle.Secondary),
    );
    await channel.send({ flags: V2FLAG, components: [c, row] });
    await i.reply({ content: "Close request sent.", ephemeral: true });
  },
};

// Only the ticket opener may accept/deny.
onButton("closereq", async (i: ButtonInteraction, parts) => {
  const action = parts[1];
  const ownerId = parts[2];
  if (i.user.id !== ownerId) {
    await i.reply({ content: "Only the ticket opener can respond to this.", ephemeral: true });
    return;
  }
  if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) return;
  const channel = i.channel as TextChannel;

  if (action === "deny") {
    await i.update({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("Close request denied. The ticket stays open."))] });
    return;
  }

  // accept -> close
  const ticketRec = await store().getTicket(channel.id);
  await i.reply({ content: "Closing…", ephemeral: true });
  try {
    const settings = await store().getGuild(i.guild.id);
    const tId = settings.channels[CHANNEL.transcripts];
    if (tId && ticketRec) {
      const tc = await i.guild.channels.fetch(tId).catch(() => null);
      if (tc && tc.type === ChannelType.GuildText) {
        const file = await buildTranscript(channel, ticketRec);
        await (tc as TextChannel).send({ content: `Transcript — #${channel.name} (close request accepted)`, files: [file] });
      }
    }
  } catch (err) {
    log.error("[closereq] transcript failed", err);
  }
  await store().deleteTicket(channel.id);
  await channel.delete().catch(() => {});
});
