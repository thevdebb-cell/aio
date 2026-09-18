import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { isWhitelisted } from "../../config/config.js";
import { ROLE } from "../../modules/tickets/core.js";

export const orderinfo: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("orderinfo")
    .setDescription("Look up an order by its ID")
    .addStringOption((o) => o.setName("id").setDescription("Order ID (e.g. SC-XXXXXXXX-XXXX)").setRequired(true)),
  execute: async (i) => {
    if (!i.guild) return;
    // staff only
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    const staff =
      isWhitelisted(i.user.id) ||
      [ROLE.highrank, ROLE.support, ROLE.qc].some((k) => settings.roles[k] && member.roles.cache.has(settings.roles[k]!)) ||
      Object.entries(settings.roles).some(([k, id]) => k.startsWith("designer_") && member.roles.cache.has(id));
    if (!staff) {
      await i.reply({ content: "This command is for staff only.", ephemeral: true });
      return;
    }

    const id = i.options.getString("id", true).trim().toUpperCase();
    const order = await store().getOrder(id);
    if (!order) {
      await i.reply({ content: `No order found with ID \`${id}\`.`, ephemeral: true });
      return;
    }

    const c = container().addTextDisplayComponents(
      text(`## Order ${order.id}`),
      text(
        [
          `**Status:** ${order.status}`,
          `**Service:** ${order.type}`,
          `**Buyer:** <@${order.buyerId}>`,
          `**Designer:** ${order.designerId ? `<@${order.designerId}>` : "—"}`,
          `**Channel:** <#${order.channelId}>`,
          `**Created:** <t:${Math.floor(order.createdAt / 1000)}:f>`,
          order.claimedAt ? `**Claimed:** <t:${Math.floor(order.claimedAt / 1000)}:f>` : "",
          order.deliveredAt ? `**Delivered:** <t:${Math.floor(order.deliveredAt / 1000)}:f>` : "",
          order.confirmedAt ? `**Confirmed:** <t:${Math.floor(order.confirmedAt / 1000)}:f>` : "",
          order.references ? `**References:**\n${order.references}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
    await i.reply({ flags: V2FLAG, components: [c], ephemeral: true });
  },
};
