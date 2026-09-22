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
    log.warn("[deploy] DISCORD_TOKEN / CLIENT_ID missing - skipping command deploy.");
    return;
  }

  const body = slashCommands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);

  /** Wipe every command in a scope (used to clear stale duplicates in the scope we are NOT using). */
  async function clearScope(route: `/${string}`, label: string) {
    try {
      await rest.put(route, { body: [] });
      log.info(`[deploy] cleared stale ${label} commands.`);
    } catch (err: any) {
      // 50001 just means we can't touch that scope - nothing to clear there.
      if (err?.code !== 50001) log.warn(`[deploy] could not clear ${label} commands: ${err?.message ?? err}`);
    }
  }

  // Prefer instant guild registration; if the app lacks the applications.commands
  // scope in that guild (50001 Missing Access), fall back to global registration,
  // which only needs the bot token and still shows the commands in the server.
  if (guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      log.info(`[deploy] registered ${body.length} guild command(s) to ${guildId}.`);
      // Remove any GLOBAL copies so old/duplicate commands don't linger alongside the guild set.
      await clearScope(Routes.applicationCommands(clientId) as `/${string}`, "global");
      return;
    } catch (err: any) {
      if (err?.code === 50001) {
        log.warn("[deploy] guild registration blocked (missing applications.commands scope) - registering GLOBALLY instead.");
      } else {
        throw err;
      }
    }
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  log.info(`[deploy] registered ${body.length} global command(s). They may take a few minutes to appear.`);
  // Remove any GUILD copies (e.g. from an earlier guild registration) so old commands vanish.
  if (guildId) await clearScope(Routes.applicationGuildCommands(clientId, guildId) as `/${string}`, "guild");
}
