import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/index.js";
import { isOwner } from "../../config/index.js";
import { ROLE } from "../../modules/tickets/core.js";
import { deliverOrder, latestApproved } from "../../modules/orders/delivery.js";

export const order: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("order")
    .setDescription("High Rank: (re)deliver an order to its buyer")
    .addStringOption((o) => o.setName("id").setDescription("Order ID").setRequired(true)),
  execute: async (i) => {
    if (!i.guild) return;
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    const hrId = settings.roles[ROLE.highrank];
    const isHr = isOwner(i.user.id) || (hrId ? member.roles.cache.has(hrId) : false);
    if (!isHr) {
      await i.reply({ content: "This command is High Rank only.", ephemeral: true });
      return;
    }

    const id = i.options.getString("id", true).trim().toUpperCase();
    const ord = await store().getOrder(id);
    if (!ord) {
      await i.reply({ content: `No order found with ID \`${id}\`.`, ephemeral: true });
      return;
    }
    if (!latestApproved(ord)) {
      await i.reply({ content: "That order has no approved delivery yet.", ephemeral: true });
      return;
    }

    await i.deferReply({ ephemeral: true });
    const { dmOk } = await deliverOrder(i.guild, ord);
    await i.editReply({ content: dmOk ? "Delivered — the buyer has been DMed." : "Delivered in the ticket, but the buyer's DMs are closed." });
  },
};
