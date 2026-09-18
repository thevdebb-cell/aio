import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { isOwner } from "../../config/config.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
const V2 = V2FLAG;
import { CHANNEL, ROLE } from "../../modules/tickets/core.js";

export const dispute: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("dispute")
    .setDescription("Dispute management")
    .addSubcommand((s) =>
      s
        .setName("verdict")
        .setDescription("High Rank: rule on a dispute")
        .addStringOption((o) => o.setName("id").setDescription("Order ID").setRequired(true))
        .addStringOption((o) =>
          o.setName("winner").setDescription("Who wins").setRequired(true).addChoices({ name: "Designer", value: "designer" }, { name: "Buyer", value: "buyer" }),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason / notes").setRequired(false)),
    ),
  execute: async (i) => {
    if (!i.guild) return;
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    const hrId = settings.roles[ROLE.highrank];
    const isHr = isOwner(i.user.id) || (hrId ? member.roles.cache.has(hrId) : false);
    if (!isHr) {
      await i.reply({ content: "High Rank only.", ephemeral: true });
      return;
    }

    const id = i.options.getString("id", true).trim().toUpperCase();
    const winner = i.options.getString("winner", true);
    const reason = i.options.getString("reason") ?? "";
    const order = await store().getOrder(id);
    if (!order) {
      await i.reply({ content: `No order found with ID \`${id}\`.`, ephemeral: true });
      return;
    }

    await i.deferReply({ ephemeral: true });
    await store().updateOrder(id, { status: winner === "buyer" ? "cancelled" : "confirmed" });

    const buyer = await i.guild.members.fetch(order.buyerId).catch(() => null);
    const designer = order.designerId ? await i.guild.members.fetch(order.designerId).catch(() => null) : null;

    if (winner === "designer") {
      await buyer?.send({ flags: V2, components: [container().addTextDisplayComponents(text("## Dispute Resolved"), text(`Order ${id} was resolved in favour of the designer`))] }).catch(() => {});
      await designer?.send({ flags: V2, components: [container().addTextDisplayComponents(text("## Dispute Resolved"), text(`Order ${id} was resolved in your favour`))] }).catch(() => {});
    } else {
      await designer
        ?.send({ flags: V2, components: [container().addTextDisplayComponents(text("## Dispute Resolved"), text(`Order ${id} was resolved in favour of the buyer\nA sanction may follow${reason ? `\nReason ${reason}` : ""}`))] })
        .catch(() => {});
      await buyer?.send({ flags: V2, components: [container().addTextDisplayComponents(text("## Dispute Resolved"), text(`Order ${id} was resolved in your favour`))] }).catch(() => {});
    }

    // Log to the dispute channel.
    const dId = settings.channels[CHANNEL.dispute];
    if (dId) {
      const dc = await i.guild.channels.fetch(dId).catch(() => null);
      if (dc && dc.type === ChannelType.GuildText) {
        await (dc as TextChannel).send({
          flags: V2FLAG,
          components: [container().addTextDisplayComponents(text("## Verdict"), text([`Order ${id}`, `Winner ${winner}`, `By <@${i.user.id}>`, reason ? `Reason ${reason}` : ""].filter(Boolean).join("\n")))],
        });
      }
    }

    await i.editReply({ content: `Verdict recorded — ${winner} wins.` });
  },
};
