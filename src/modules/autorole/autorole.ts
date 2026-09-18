import type { GuildMember } from "discord.js";
import { config } from "../../config/config.js";
import { log } from "../../lib/logger.js";

/** Assign the configured auto-roles to a member on join. */
export async function applyAutoRoles(member: GuildMember) {
  const roles = config.autoRoles.filter((id) => /^\d+$/.test(id));
  if (!roles.length) return;
  await member.roles.add(roles, "Auto-role on join").catch((err) => log.debug("[autorole] failed", err));
}
