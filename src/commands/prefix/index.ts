import type { PrefixCommand } from "../../lib/framework.js";
import { generalPrefix } from "./general.js";
import { adminPrefix } from "./admin.js";
import { rateslogs } from "./rateslogs.js";

export const prefixCommands: PrefixCommand[] = [...generalPrefix, ...adminPrefix, rateslogs];

/** name/alias -> command lookup. */
export const prefixLookup = new Map<string, PrefixCommand>();
for (const cmd of prefixCommands) {
  prefixLookup.set(cmd.name.toLowerCase(), cmd);
  for (const a of cmd.aliases ?? []) prefixLookup.set(a.toLowerCase(), cmd);
}
