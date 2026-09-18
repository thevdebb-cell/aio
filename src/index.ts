import "dotenv/config";
import { createClient } from "./lib/client.js";
import { initStore } from "./lib/store/store.js";
import { initFileStore } from "./lib/files/files.js";
import { slashCommands } from "./commands/slash/registry.js";
import { events } from "./events/registry.js";
import { deployCommands } from "./lib/deploy.js";
import { log } from "./lib/logger.js";
// Side-effect import: registers all button/select/modal handlers.
import "./modules/register.js";

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    log.error("DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  await initStore();
  await initFileStore();

  // Auto-register slash commands on startup (disable with DEPLOY_ON_START=false).
  if (process.env.DEPLOY_ON_START !== "false") {
    try {
      await deployCommands();
    } catch (err) {
      log.error("[startup] command deploy failed (continuing anyway)", err);
    }
  }

  const client = createClient();
  for (const cmd of slashCommands) client.slash.set(cmd.data.name, cmd);

  for (const ev of events) {
    if (ev.once) client.once(ev.name, (...args) => (ev.execute as (...a: unknown[]) => unknown)(...args));
    else client.on(ev.name, (...args) => (ev.execute as (...a: unknown[]) => unknown)(...args));
  }

  process.on("unhandledRejection", (err) => log.error("unhandledRejection", err));
  process.on("uncaughtException", (err) => log.error("uncaughtException", err));

  await client.login(token);
}

main().catch((err) => {
  log.error("fatal startup error", err);
  process.exit(1);
});
