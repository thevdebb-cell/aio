import type { Message, GuildTextBasedChannel } from "discord.js";

/**
 * Narrow a Message's channel to a sendable guild text-based channel.
 * All prefix commands run guild-side (messageCreate returns early on DMs),
 * so this cast is safe and keeps call sites tidy.
 */
export function out(message: Message): GuildTextBasedChannel {
  return message.channel as GuildTextBasedChannel;
}
