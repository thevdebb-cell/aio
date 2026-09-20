import { Events, type Message } from "discord.js";
import { defineEvent, PREFIX } from "../lib/framework.js";
import { prefixLookup } from "../commands/prefix/registry.js";
import { isOwner, isWhitelisted } from "../config/config.js";
import { store } from "../lib/store/store.js";
import { handleAfkMessage } from "../modules/afk/afk.js";
import { log } from "../lib/logger.js";

/**
 * Detect a message sent by an external / user-installed app (the "External" tag).
 * Such apps have an applicationId but no member in the guild. We never touch our
 * own messages, real installed bots, or webhooks the server set up.
 */
function isExternalApp(message: Message): boolean {
  if (!message.guild) return false;
  if (message.author.id === message.client.user?.id) return false;
  if (!message.applicationId) return false;
  if (message.applicationId === message.client.application?.id) return false;
  const member = message.guild.members.cache.get(message.author.id);
  if (member) return false; // it's an installed bot in the guild, not an external app
  return true;
}

export default defineEvent({
  name: Events.MessageCreate,
  execute: async (message: Message) => {
    if (!message.guild) return;

    // Block external / user-installed apps (runs before the bot check).
    if (isExternalApp(message)) {
      await message.delete().catch(() => {});
      if ("send" in message.channel) {
        const notice = await message.channel.send({ content: "external apps are not allowed" }).catch(() => null);
        if (notice) setTimeout(() => notice.delete().catch(() => {}), 3000);
      }
      return;
    }

    if (message.author.bot) return;

    // AFK: clear the author's AFK / notify on mentions.
    await handleAfkMessage(message);

    if (!message.content.startsWith(PREFIX)) return;

    const [name, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    if (!name) return;
    const cmd = prefixLookup.get(name.toLowerCase());
    if (!cmd) return;

    // Permission gate.
    if (cmd.ownerOnly && !isOwner(message.author.id)) {
      await message.reply({ content: "This command is owner-only." }).catch(() => {});
      return;
    }
    if (cmd.whitelistOnly && !isWhitelisted(message.author.id)) {
      await message.reply({ content: "This command is whitelist-only." }).catch(() => {});
      return;
    }

    // Log ! commands run by owners / whitelist (for !prefixlogs).
    if (isWhitelisted(message.author.id)) {
      await store()
        .addPrefixLog({
          userId: message.author.id,
          command: cmd.name,
          raw: message.content.slice(0, 300),
          guildId: message.guild.id,
          channelId: message.channel.id,
          createdAt: Date.now(),
        })
        .catch(() => {});
    }

    try {
      await cmd.execute(message, args);
    } catch (err) {
      log.error(`[prefix] ${cmd.name} failed`, err);
      await message.reply({ content: "Something went wrong running that command." }).catch(() => {});
    }
  },
});
