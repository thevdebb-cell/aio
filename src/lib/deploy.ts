import { REST, Routes } from "discord.js";
import { slashCommands } from "../commands/slash/registry.js";
import { log } from "./logger.js";

/**
 * Register the slash commands with Discord.
 * Guild scope (instant) when GUILD_ID is set, otherwise global.
 * Called automatically on startup unless DEPLOY_ON_START=false.
 */
export async function deployCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) {
    log.warn("[deploy] DISCORD_TOKEN / CLIENT_ID missing — skipping command deploy.");
    return;
  }

  const body = slashCommands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    log.info(`[deploy] registered ${body.length} guild command(s) to ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    log.info(`[deploy] registered ${body.length} global command(s).`);
  }
}
