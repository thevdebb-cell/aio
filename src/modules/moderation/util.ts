import { ChannelType, type Guild, type TextChannel } from "discord.js";
import { store, newId } from "../../lib/store/store.js";
import type { ModRecord, ModRecordType } from "../../lib/store/types.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { CHANNEL } from "../tickets/core.js";

/** Parse "10m", "2h", "1d", "30s" -> milliseconds. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const m = input.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const mult = unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
  return n * mult;
}

/** Record a moderation action and post a log embed to the logs channel. */
export async function recordAndLog(
  guild: Guild,
  data: Omit<ModRecord, "id" | "guildId" | "createdAt">,
  logTitle: string,
): Promise<ModRecord> {
  const record: ModRecord = { id: newId("mod"), guildId: guild.id, createdAt: Date.now(), ...data };
  await store().addModRecord(record);

  const settings = await store().getGuild(guild.id);
  const chanId = settings.channels[CHANNEL.logs];
  if (chanId) {
    const chan = await guild.channels.fetch(chanId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      const lines = [
        `**Type:** ${record.type}${record.category ? ` (${record.category})` : ""}`,
        `**User:** <@${record.targetId}>`,
        `**Moderator:** <@${record.moderatorId}>`,
        record.extra ? `**Details:** ${record.extra}` : "",
        `**Reason:** ${record.reason || "No reason provided"}`,
      ].filter(Boolean);
      await (chan as TextChannel).send({
        flags: V2FLAG,
        components: [container().addTextDisplayComponents(text(`## ${logTitle}`), text(lines.join("\n")))],
      }).catch(() => {});
    }
  }
  return record;
}
