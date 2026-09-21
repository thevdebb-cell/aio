import { ActivityType, Events } from "discord.js";
import { defineEvent } from "../lib/framework.js";
import { log } from "../lib/logger.js";

export default defineEvent({
  name: Events.ClientReady,
  once: true,
  execute: (client) => {
    log.info(`Logged in as ${client.user?.tag} - serving ${client.guilds.cache.size} guild(s)`);
    client.user?.setPresence({
      activities: [{ name: "Star Customs", type: ActivityType.Watching }],
      status: "online",
    });
  },
});
