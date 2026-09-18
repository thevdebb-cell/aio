import "dotenv/config";
import { deployCommands } from "./lib/deploy.js";
import { log } from "./lib/logger.js";

deployCommands()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("deploy failed", err);
    process.exit(1);
  });
