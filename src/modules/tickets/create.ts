import { ChannelType, type Guild, type TextChannel } from "discord.js";
import type { GuildSettings } from "../../lib/store/types.js";
import { ticketOverwrites } from "./core.js";

/** Create a locked ticket text channel (unclaimed state) and return it. */
export async function createTicketChannel(opts: {
  guild: Guild;
  settings: GuildSettings;
  name: string;
  parentKey?: string; // logical key of a category channel from setup
  buyerId: string;
  staffRoleKeys: string[];
  topic?: string;
}): Promise<TextChannel> {
  const { guild, settings, name, parentKey, buyerId, staffRoleKeys, topic } = opts;
  const parentId = parentKey ? settings.channels[parentKey] : undefined;

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    topic,
    permissionOverwrites: ticketOverwrites({
      guild,
      settings,
      buyerId,
      staffRoleKeys,
      claimerId: null,
    }),
  });
  return channel as TextChannel;
}
