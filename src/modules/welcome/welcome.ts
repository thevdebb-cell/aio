import {
  ActionRowBuilder,
  type AttachmentBuilder,
  AttachmentBuilder as AB,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type GuildMember,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type TextChannel,
} from "discord.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config/config.js";
import { container, text, separator, e, ASSETS_DIR } from "../../lib/ui.js";
import { V2 } from "../tickets/core.js";
import { log } from "../../lib/logger.js";

/** Link buttons to the key channels. */
function linkRow(): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (config.links.dashboard) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Dashboard").setURL(config.links.dashboard));
  if (config.links.assistance) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Assistance").setURL(config.links.assistance));
  if (config.links.order) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Order").setURL(config.links.order));
  return row;
}

/** A non-clickable button showing the member count after this join. */
function countRow(count: number): ActionRowBuilder<ButtonBuilder> {
  const emoji = e(config.emojis.memberCount);
  const btn = new ButtonBuilder()
    .setCustomId("welcome:count")
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`Member #${count}`)
    .setDisabled(true);
  if (emoji) btn.setEmoji(emoji);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

export async function onMemberJoin(member: GuildMember) {
  // 1) Public welcome in the configured channel.
  try {
    const chanId = config.welcome.channelId;
    if (chanId && /^\d+$/.test(chanId)) {
      const chan = await member.guild.channels.fetch(chanId).catch(() => null);
      if (chan && chan.type === ChannelType.GuildText) {
        const c = container();
        c.addTextDisplayComponents(
          text(`## Welcome`),
          text(`Welcome <@${member.id}> to **Star Customs**. Take a look at the channels below to get started.`),
        );
        await (chan as TextChannel).send({
          flags: V2,
          components: [c, linkRow(), countRow(member.guild.memberCount)],
        });
      }
    }
  } catch (err) {
    log.error("[welcome] channel message failed", err);
  }

  // 2) DM with a banner + the same links.
  try {
    const c = container();
    const bannerName = config.banners.welcomeDm;
    const files: AttachmentBuilder[] = [];
    if (bannerName && existsSync(join(ASSETS_DIR, bannerName))) {
      c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerName}`)));
      files.push(new AB(join(ASSETS_DIR, bannerName), { name: bannerName }));
    }
    c.addTextDisplayComponents(
      text(`## Welcome to Star Customs`),
      text(`Thanks for joining, ${member.user.username}. Here are the important channels to get you going.`),
    );
    await member.send({ flags: V2, components: [c, linkRow()], files }).catch(() => {});
  } catch (err) {
    log.debug("[welcome] DM failed (DMs likely closed)");
  }
}
