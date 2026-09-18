import "dotenv/config";
import { createClient } from "./lib/client.js";
import { initStore } from "./lib/store/index.js";
import { initFileStore } from "./lib/files/index.js";
import { slashCommands } from "./commands/slash/index.js";
import { events } from "./events/index.js";
import { log } from "./lib/logger.js";
// Side-effect import: registers all button/select/modal handlers.
import "./modules/index.js";

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    log.error("DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  await initStore();
  await initFileStore();

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
