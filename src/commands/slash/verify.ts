import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { verifyMember } from "../../modules/verification/verification.js";

export const verify: SlashCommand = {
  data: new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account via Bloxlink"),
  execute: async (i) => {
    if (!i.guild) return;
    await i.deferReply({ ephemeral: true });
    const member = await i.guild.members.fetch(i.user.id);
    const res = await verifyMember(member);
    if (res.ok) {
      await i.editReply({ content: `Verified as **${res.robloxName ?? res.robloxId}**.` });
    } else {
      await i.editReply({ content: res.reason ?? "Could not verify." });
    }
  },
};
