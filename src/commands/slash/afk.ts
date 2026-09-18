import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { setAfk } from "../../modules/afk/index.js";

export const afk: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself as AFK")
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
  execute: async (i) => {
    const reason = i.options.getString("reason") ?? "AFK";
    setAfk(i.user.id, reason);
    await i.reply({ content: `You're now AFK: ${reason}`, ephemeral: true });
  },
};
