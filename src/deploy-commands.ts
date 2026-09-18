import "dotenv/config";
import { REST, Routes } from "discord.js";
import { slashCommands } from "./commands/slash/index.js";
import { log } from "./lib/logger.js";

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) {
    log.error("DISCORD_TOKEN and CLIENT_ID are required to deploy commands.");
    process.exit(1);
  }

  const body = slashCommands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    log.info(`Deployed ${body.length} guild command(s) to ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    log.info(`Deployed ${body.length} global command(s).`);
  }
}

main().catch((err) => {
  log.error("deploy failed", err);
  process.exit(1);
});
