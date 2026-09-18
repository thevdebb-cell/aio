import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Config } from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Candidate locations, checked in order. This makes both run modes work:
//  - tsx (source):      __dirname = <root>/src/config
//  - compiled (dist):   __dirname = <root>/dist/config  (JSON isn't copied there)
// and it lets you keep config.json at the project root if you prefer.
const REAL_CANDIDATES = [
  join(__dirname, "config.json"),
  join(process.cwd(), "src", "config", "config.json"),
  join(process.cwd(), "config.json"),
];
const EXAMPLE_CANDIDATES = [
  join(__dirname, "config.example.json"),
  join(process.cwd(), "src", "config", "config.example.json"),
  join(process.cwd(), "config.example.json"),
];

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

function load(): Config {
  const real = firstExisting(REAL_CANDIDATES);
  const path = real ?? firstExisting(EXAMPLE_CANDIDATES);
  if (!path) {
    throw new Error(
      "[config] no config.json or config.example.json found. Copy src/config/config.example.json " +
        "to src/config/config.json (or to the project root) and fill in your IDs.",
    );
  }
  if (!real) {
    console.warn("[config] config.json not found — using config.example.json. Copy it to config.json and fill in your IDs.");
  }
  const cfg = JSON.parse(readFileSync(path, "utf8")) as Config;

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
