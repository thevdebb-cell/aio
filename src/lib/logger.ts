/* Tiny timestamped logger. No external dependency. */

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export const log = {
  info: (...a: unknown[]) => console.log(`[${ts()}] [i]`, ...a),
  warn: (...a: unknown[]) => console.warn(`[${ts()}] [!]`, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] [x]`, ...a),
  debug: (...a: unknown[]) => {
    if (process.env.DEBUG) console.log(`[${ts()}] [d]`, ...a);
  },
};
