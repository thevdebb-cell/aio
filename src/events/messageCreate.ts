import { Events, type Message } from "discord.js";
import { defineEvent, PREFIX } from "../lib/framework.js";
import { prefixLookup } from "../commands/prefix/index.js";
import { isOwner, isWhitelisted } from "../config/index.js";
import { store } from "../lib/store/index.js";
import { log } from "../lib/logger.js";

export default defineEvent({
  name: Events.MessageCreate,
  execute: async (message: Message) => {
    if (message.author.bot || !message.guild) return;
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
