import { ChannelType, SlashCommandBuilder, type TextChannel, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { watermarkImage } from "../../modules/orders/watermark.js";
import { log } from "../../lib/logger.js";

export const sendimage: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("sendimage")
    .setDescription("Designers: post a watermarked image into this order ticket")
    .addAttachmentOption((o) => o.setName("file").setDescription("Image to send").setRequired(true)),
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
    const allowed =
      memberHasAnyRole(member, settings, [ROLE.designer(ticket.type)]) || ticket.claimedBy === i.user.id;
    if (!allowed) {
      await i.reply({ content: "Only the designer on this order can send images.", ephemeral: true });
      return;
    }

    const file = i.options.getAttachment("file", true);
    if (!file.contentType?.startsWith("image/")) {
      await i.reply({ content: "That isn't an image. Use `/submit` for files, zips or links.", ephemeral: true });
      return;
    }

    await i.deferReply({ ephemeral: true });
    try {
      const res = await fetch(file.url);
      const buf = Buffer.from(await res.arrayBuffer());
      const wm = await watermarkImage(buf, file.name ?? "image.png");
      const attachment = new AttachmentBuilder(wm.buffer, { name: wm.filename });

      const c = container()
        .addTextDisplayComponents(text(`Sent by <@${i.user.id}>`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${wm.filename}`)));

      await channel.send({ flags: V2FLAG, components: [c], files: [attachment] });
      await i.editReply({ content: "Image sent." });
    } catch (err) {
      log.error("[sendimage] failed", err);
      await i.editReply({ content: "Couldn't process that image." });
    }
  },
};
