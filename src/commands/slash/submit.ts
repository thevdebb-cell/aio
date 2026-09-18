import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/index.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { handleSubmit } from "../../modules/orders/submit.js";

export const submit: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("submit")
    .setDescription("Designers: submit an order deliverable to Quality Control")
    .addSubcommand((s) => s.setName("file").setDescription("Submit an image file").addAttachmentOption((o) => o.setName("file").setDescription("The image").setRequired(true)))
    .addSubcommand((s) => s.setName("zip").setDescription("Submit a zip archive").addAttachmentOption((o) => o.setName("file").setDescription("The zip").setRequired(true)))
    .addSubcommand((s) => s.setName("link").setDescription("Submit a link").addStringOption((o) => o.setName("url").setDescription("The link").setRequired(true)))
    .addSubcommand((s) => s.setName("id").setDescription("Submit a reference id").addStringOption((o) => o.setName("value").setDescription("The id / reference").setRequired(true))),
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
      await i.reply({ content: "Only the designer on this order can submit.", ephemeral: true });
      return;
    }

    await i.deferReply({ ephemeral: true });
    const sub = i.options.getSubcommand();
    let result: string;

    if (sub === "file" || sub === "zip") {
      const file = i.options.getAttachment("file", true);
      result = await handleSubmit({
        guild: i.guild,
        channel,
        userId: i.user.id,
        kind: sub,
        value: file.url,
        attachmentUrl: file.url,
        filename: file.name ?? `${sub}.bin`,
        contentType: file.contentType ?? undefined,
      });
    } else if (sub === "link") {
      result = await handleSubmit({ guild: i.guild, channel, userId: i.user.id, kind: "link", value: i.options.getString("url", true) });
    } else {
      result = await handleSubmit({ guild: i.guild, channel, userId: i.user.id, kind: "id", value: i.options.getString("value", true) });
    }

    await i.editReply({ content: result });
  },
};
