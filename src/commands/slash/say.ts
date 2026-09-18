import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { isWhitelisted } from "../../config/index.js";

export const say: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message")
    .addStringOption((o) => o.setName("message").setDescription("What to say").setRequired(true))
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Where to say it (defaults to here)").addChannelTypes(ChannelType.GuildText).setRequired(false),
    ),
  execute: async (i) => {
    if (!isWhitelisted(i.user.id)) {
      await i.reply({ content: "You aren't allowed to use this.", ephemeral: true });
      return;
    }
    const message = i.options.getString("message", true);
    const channel = (i.options.getChannel("channel") as TextChannel | null) ?? (i.channel as TextChannel);
    await channel.send({ content: message });
    await i.reply({ content: `Sent in <#${channel.id}>.`, ephemeral: true });
  },
};
