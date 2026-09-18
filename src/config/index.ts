import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Config } from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REAL = join(__dirname, "config.json");
const EXAMPLE = join(__dirname, "config.example.json");

function load(): Config {
  const path = existsSync(REAL) ? REAL : EXAMPLE;
  if (path === EXAMPLE) {
    console.warn(
      "[config] src/config/config.json not found — falling back to config.example.json. " +
        "Copy it to config.json and fill in your IDs.",
    );
  }
  const raw = readFileSync(path, "utf8");
  const cfg = JSON.parse(raw) as Config;

  if (!Array.isArray(cfg.owners) || cfg.owners.length === 0) {
    console.warn("[config] no owners configured — owner-only commands will be locked for everyone.");
  }
  return cfg;
}

export const config: Config = load();

/** Owners have full power (can run every ! command). */
export function isOwner(userId: string): boolean {
  return config.owners.includes(userId);
}

/** Whitelist = trusted staff (service commands, /say, etc.). Owners are implicitly whitelisted. */
export function isWhitelisted(userId: string): boolean {
  return config.owners.includes(userId) || config.whitelist.includes(userId);
}

export function serviceByKey(key: string) {
  return config.services.find((s) => s.key.toLowerCase() === key.toLowerCase());
}
