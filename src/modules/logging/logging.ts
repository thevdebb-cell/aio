import { ChannelType, type Guild, type TextChannel } from "discord.js";
import { store } from "../../lib/store/store.js";
import { CHANNEL } from "../tickets/core.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { log } from "../../lib/logger.js";

/** Post a plain server-log line (Components V2, black, no footer) to the logs channel. */
export async function serverLog(guild: Guild, title: string, body: string) {
  try {
    const settings = await store().getGuild(guild.id);
    const chanId = settings.channels[CHANNEL.logs];
    if (!chanId) return;
    const chan = await guild.channels.fetch(chanId).catch(() => null);
    if (!chan || chan.type !== ChannelType.GuildText) return;
    await (chan as TextChannel).send({
      flags: V2FLAG,
      components: [container().addTextDisplayComponents(text(`## ${title}`), text(body))],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    log.error("[logging] could not post server log", err);
  }
}

function stamp(): string {
  return `<t:${Math.floor(Date.now() / 1000)}:f>`;
}

export async function logMemberJoin(guild: Guild, userId: string, tag: string) {
  await serverLog(guild, "Member Joined", `<@${userId}> **${tag}** (\`${userId}\`)\n${stamp()}`);
}

export async function logMemberLeave(guild: Guild, userId: string, tag: string) {
  await serverLog(guild, "Member Left", `<@${userId}> **${tag}** (\`${userId}\`)\n${stamp()}`);
}

export async function logBan(guild: Guild, userId: string, tag: string, banned: boolean) {
  await serverLog(guild, banned ? "Member Banned" : "Member Unbanned", `<@${userId}> **${tag}** (\`${userId}\`)\n${stamp()}`);
}

export async function logMessageDelete(guild: Guild, channelId: string, authorId: string | null, content: string) {
  const body = [
    `**Author:** ${authorId ? `<@${authorId}> (\`${authorId}\`)` : "Unknown"}`,
    `**Channel:** <#${channelId}>`,
    content ? `**Content:**\n${content.slice(0, 1500)}` : "**Content:** (no text / attachment only)",
    stamp(),
  ].join("\n");
  await serverLog(guild, "Message Deleted", body);
}

export async function logMessageEdit(guild: Guild, channelId: string, authorId: string | null, before: string, after: string) {
  const body = [
    `**Author:** ${authorId ? `<@${authorId}> (\`${authorId}\`)` : "Unknown"}`,
    `**Channel:** <#${channelId}>`,
    `**Before:**\n${(before || "(empty)").slice(0, 700)}`,
    `**After:**\n${(after || "(empty)").slice(0, 700)}`,
    stamp(),
  ].join("\n");
  await serverLog(guild, "Message Edited", body);
}
