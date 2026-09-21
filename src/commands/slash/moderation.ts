import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { recordAndLog, parseDuration } from "../../modules/moderation/util.js";

async function gate(i: ChatInputCommandInteraction, roleKeys: string[]): Promise<boolean> {
  if (!i.guild) return false;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  if (memberHasAnyRole(member, settings, roleKeys)) return true;
  await i.reply({ content: "You don't have permission to use this.", ephemeral: true });
  return false;
}

const ban: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.highrank]))) return;
    const user = i.options.getUser("user", true);
    const reason = i.options.getString("reason") ?? "No reason provided";
    await i.deferReply({ ephemeral: true });
    await i.guild!.members.fetch(user.id).then((m) => m.send(`You were banned from ${i.guild!.name}. Reason: ${reason}`).catch(() => {})).catch(() => {});
    await i.guild!.members.ban(user.id, { reason }).catch(() => {});
    await recordAndLog(i.guild!, { type: "ban", category: null, targetId: user.id, moderatorId: i.user.id, reason, extra: null }, "Ban");
    await i.editReply({ content: `Banned <@${user.id}>.` });
  },
};

const kick: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.highrank]))) return;
    const user = i.options.getUser("user", true);
    const reason = i.options.getString("reason") ?? "No reason provided";
    await i.deferReply({ ephemeral: true });
    const m = await i.guild!.members.fetch(user.id).catch(() => null);
    if (m) {
      await m.send(`You were kicked from ${i.guild!.name}. Reason: ${reason}`).catch(() => {});
      await m.kick(reason).catch(() => {});
    }
    await recordAndLog(i.guild!, { type: "kick", category: null, targetId: user.id, moderatorId: i.user.id, reason, extra: null }, "Kick");
    await i.editReply({ content: `Kicked <@${user.id}>.` });
  },
};

const timeout: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout (mute) a user")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 2h, 1d").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.support]))) return;
    const user = i.options.getUser("user", true);
    const durationStr = i.options.getString("duration", true);
    const reason = i.options.getString("reason") ?? "No reason provided";
    const ms = parseDuration(durationStr);
    if (!ms || ms > 28 * 86400000) {
      await i.reply({ content: "Invalid duration. Use e.g. `10m`, `2h`, `1d` (max 28d).", ephemeral: true });
      return;
    }
    await i.deferReply({ ephemeral: true });
    const m = await i.guild!.members.fetch(user.id).catch(() => null);
    if (m) await m.timeout(ms, reason).catch(() => {});
    await recordAndLog(i.guild!, { type: "timeout", category: null, targetId: user.id, moderatorId: i.user.id, reason, extra: durationStr }, "Timeout");
    await i.editReply({ content: `Timed out <@${user.id}> for ${durationStr}.` });
  },
};

const untimeout: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a user's timeout")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.support]))) return;
    const user = i.options.getUser("user", true);
    await i.deferReply({ ephemeral: true });
    const m = await i.guild!.members.fetch(user.id).catch(() => null);
    if (m) await m.timeout(null).catch(() => {});
    await recordAndLog(i.guild!, { type: "untimeout", category: null, targetId: user.id, moderatorId: i.user.id, reason: "", extra: null }, "Timeout removed");
    await i.editReply({ content: `Removed timeout from <@${user.id}>.` });
  },
};

const warn: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.support]))) return;
    const user = i.options.getUser("user", true);
    const reason = i.options.getString("reason", true);
    await i.deferReply({ ephemeral: true });
    await i.guild!.members.fetch(user.id).then((m) => m.send(`You were warned in ${i.guild!.name}. Reason: ${reason}`).catch(() => {})).catch(() => {});
    await recordAndLog(i.guild!, { type: "warn", category: null, targetId: user.id, moderatorId: i.user.id, reason, extra: null }, "Warn");
    await i.editReply({ content: `Warned <@${user.id}>.` });
  },
};

const warnings: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("List a user's warnings")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.support]))) return;
    const user = i.options.getUser("user", true);
    const records = await store().listModRecords(i.guild!.id, { targetId: user.id, type: "warn" });
    const body = records.length
      ? records.map((r) => `<t:${Math.floor(r.createdAt / 1000)}:d> • by <@${r.moderatorId}> • ${r.reason}`).join("\n")
      : "No warnings.";
    await i.reply({
      flags: V2FLAG,
      components: [container().addTextDisplayComponents(text(`## Warnings - ${user.tag}`), text(body))],
      ephemeral: true,
    });
  },
};

const purge: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages")
    .addIntegerOption((o) => o.setName("amount").setDescription("How many (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  execute: async (i) => {
    if (!(await gate(i, [ROLE.support]))) return;
    if (!i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this in a text channel.", ephemeral: true });
      return;
    }
    const amount = i.options.getInteger("amount", true);
    await i.deferReply({ ephemeral: true });
    const deleted = await (i.channel as TextChannel).bulkDelete(amount, true).catch(() => null);
    await i.editReply({ content: `Deleted ${deleted?.size ?? 0} message(s).` });
  },
};

export const moderationCommands: SlashCommand[] = [ban, kick, timeout, untimeout, warn, warnings, purge];
