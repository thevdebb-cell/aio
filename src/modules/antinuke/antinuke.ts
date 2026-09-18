import {
  AuditLogEvent,
  ChannelType,
  type DMChannel,
  type GuildAuditLogsEntry,
  type GuildBasedChannel,
  type GuildMember,
  type Guild,
  type NonThreadGuildBasedChannel,
  OverwriteType,
  PermissionFlagsBits,
} from "discord.js";
import { isWhitelisted, isOwner } from "../../config/config.js";
import { store } from "../../lib/store/store.js";
import { ROLE, CHANNEL } from "../tickets/core.js";
import { log } from "../../lib/logger.js";

const QUARANTINE_STRIKES = 3;
const TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** userId -> strike count within the guild. Resets on quarantine. */
const strikes = new Map<string, number>();

function key(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

async function executorOf(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string,
): Promise<string | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find((entryItem: GuildAuditLogsEntry) => {
      const fresh = now - entryItem.createdTimestamp < 10_000;
      const matchTarget = targetId ? (entryItem.targetId ?? undefined) === targetId : true;
      return fresh && matchTarget;
    });
    return entry?.executorId ?? null;
  } catch (err) {
    log.debug("[antinuke] could not read audit logs (missing View Audit Log permission?)");
    return null;
  }
}

/** True if the action was performed by someone we don't trust. */
function untrusted(executorId: string | null, guild: Guild): boolean {
  if (!executorId) return false; // can't attribute -> don't punish
  if (executorId === guild.client.user!.id) return false; // the bot itself
  if (executorId === guild.ownerId) return false; // server owner
  return !isWhitelisted(executorId);
}

async function dm(guild: Guild, userId: string, message: string) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.send(message).catch(() => {});
}

async function strike(guild: Guild, userId: string, reason: string) {
  const k = key(guild.id, userId);
  const count = (strikes.get(k) ?? 0) + 1;
  strikes.set(k, count);
  log.warn(`[antinuke] strike ${count}/${QUARANTINE_STRIKES} for ${userId} — ${reason}`);

  if (count >= QUARANTINE_STRIKES) {
    strikes.delete(k);
    await quarantine(guild, userId, reason);
  } else {
    await dm(
      guild,
      userId,
      `Warning (${count}/${QUARANTINE_STRIKES}): unauthorized action detected — ${reason}. ` +
        `Continuing will get you quarantined and timed out.`,
    );
  }
}

async function quarantine(guild: Guild, userId: string, reason: string) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const settings = await store().getGuild(guild.id);
  const quarantineRoleId = settings.roles[ROLE.quarantine];

  await dm(guild, userId, `You have been quarantined in ${guild.name} for repeated unauthorized actions (${reason}).`);

  // Strip roles, apply quarantine role, timeout.
  try {
    const removable = member.roles.cache.filter((r) => r.id !== guild.roles.everyone.id && r.editable);
    await member.roles.remove(removable, `Anti-nuke quarantine: ${reason}`).catch(() => {});
    if (quarantineRoleId) await member.roles.add(quarantineRoleId, "Anti-nuke quarantine").catch(() => {});
    await member.timeout(TIMEOUT_MS, `Anti-nuke quarantine: ${reason}`).catch(() => {});
    log.warn(`[antinuke] quarantined ${member.user.tag}`);
  } catch (err) {
    log.error("[antinuke] quarantine failed", err);
  }
}

// ── Bots: only owners may add a bot ─────────────────────
export async function onMemberAdd(member: GuildMember) {
  if (!member.user.bot) return;
  const adder = await executorOf(member.guild, AuditLogEvent.BotAdd, member.id);
  if (adder && !isOwner(adder)) {
    log.warn(`[antinuke] non-owner ${adder} added bot ${member.user.tag} — kicking bot`);
    await member.kick("Anti-nuke: bots may only be added by an owner").catch(() => {});
    await strike(member.guild, adder, "adding a bot");
  }
}

// ── Channel created by non-WL -> delete it ──────────────
export async function onChannelCreate(channel: NonThreadGuildBasedChannel) {
  const guild = channel.guild;
  const who = await executorOf(guild, AuditLogEvent.ChannelCreate, channel.id);
  if (untrusted(who, guild)) {
    log.warn(`[antinuke] ${who} created #${channel.name} — deleting`);
    await channel.delete("Anti-nuke: unauthorized channel creation").catch(() => {});
    await strike(guild, who!, "creating a channel");
  }
}

// ── Channel deleted by non-WL -> recreate it ────────────
export async function onChannelDelete(channel: NonThreadGuildBasedChannel) {
  const guild = channel.guild;
  const who = await executorOf(guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!untrusted(who, guild)) return;

  log.warn(`[antinuke] ${who} deleted #${channel.name} — restoring`);
  try {
    await guild.channels.create({
      name: channel.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: channel.type as any,
      parent: channel.parentId ?? undefined,
      position: "position" in channel ? channel.position : undefined,
      topic: "topic" in channel ? (channel.topic ?? undefined) : undefined,
      nsfw: "nsfw" in channel ? channel.nsfw : undefined,
      permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.toArray(),
        deny: o.deny.toArray(),
      })),
    });
  } catch (err) {
    log.error("[antinuke] channel restore failed", err);
  }
  await strike(guild, who!, "deleting a channel");
}

// ── Channel edited by non-WL -> revert name/topic ───────
export async function onChannelUpdate(
  oldChannel: NonThreadGuildBasedChannel,
  newChannel: NonThreadGuildBasedChannel,
) {
  const guild = newChannel.guild;
  const who = await executorOf(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
  if (!untrusted(who, guild)) return;

  const nameChanged = oldChannel.name !== newChannel.name;
  const topicChanged =
    "topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic;
  if (!nameChanged && !topicChanged) return;

  log.warn(`[antinuke] ${who} edited #${newChannel.name} — reverting`);
  try {
    if (nameChanged) await newChannel.setName(oldChannel.name, "Anti-nuke: revert").catch(() => {});
    if (topicChanged && "setTopic" in newChannel) {
      // @ts-expect-error setTopic exists on text-based channels
      await newChannel.setTopic(oldChannel.topic ?? null, "Anti-nuke: revert").catch(() => {});
    }
  } catch (err) {
    log.error("[antinuke] channel revert failed", err);
  }
  await strike(guild, who!, "editing a channel");
}

export function resetStrikes(guildId: string, userId: string) {
  strikes.delete(key(guildId, userId));
}
