import type { GuildMember } from "discord.js";
import { config } from "../../config/index.js";
import { log } from "../../lib/logger.js";

export interface VerifyResult {
  ok: boolean;
  robloxId?: string;
  robloxName?: string;
  reason?: string;
}

/**
 * Resolve a Discord member to their Roblox account via the Bloxlink API,
 * then (best-effort) set their nickname and grant the verified role.
 * Requires BLOXLINK_API_KEY.
 */
export async function verifyMember(member: GuildMember): Promise<VerifyResult> {
  const key = process.env.BLOXLINK_API_KEY;
  if (!key) return { ok: false, reason: "Bloxlink is not configured (missing BLOXLINK_API_KEY)." };

  try {
    const url = `https://api.blox.link/v4/public/guilds/${member.guild.id}/discord-to-roblox/${member.id}`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (res.status === 404) return { ok: false, reason: "You aren't linked with Bloxlink yet. Verify at https://blox.link and try again." };
    if (!res.ok) return { ok: false, reason: `Bloxlink returned an error (${res.status}).` };

    const data: any = await res.json();
    const robloxId: string | undefined = data.robloxID ?? data.robloxId;
    if (!robloxId) return { ok: false, reason: "No linked Roblox account found." };

    let robloxName: string | undefined = data?.resolved?.roblox?.name;
    if (!robloxName) {
      const r2 = await fetch(`https://users.roblox.com/v1/users/${robloxId}`).catch(() => null);
      if (r2 && r2.ok) robloxName = (await r2.json())?.name;
    }

    // Apply nickname + verified role (best effort).
    if (robloxName) await member.setNickname(robloxName).catch(() => {});
    if (config.verifiedRoleId) await member.roles.add(config.verifiedRoleId).catch(() => {});

    return { ok: true, robloxId, robloxName };
  } catch (err) {
    log.error("[verify] failed", err);
    return { ok: false, reason: "Verification failed, please try again later." };
  }
}
