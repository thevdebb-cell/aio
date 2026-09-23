import {
  Events,
  type GuildBan,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
} from "discord.js";
import { defineEvent } from "../lib/framework.js";
import { logMemberLeave, logBan, logMessageDelete, logMessageEdit } from "../modules/logging/logging.js";

export const memberRemoveEvent = defineEvent({
  name: Events.GuildMemberRemove,
  execute: async (member: GuildMember | PartialGuildMember) => {
    if (!member.guild) return;
    await logMemberLeave(member.guild, member.id, member.user?.tag ?? "unknown");
  },
});

export const banAddEvent = defineEvent({
  name: Events.GuildBanAdd,
  execute: async (ban: GuildBan) => {
    await logBan(ban.guild, ban.user.id, ban.user.tag, true);
  },
});

export const banRemoveEvent = defineEvent({
  name: Events.GuildBanRemove,
  execute: async (ban: GuildBan) => {
    await logBan(ban.guild, ban.user.id, ban.user.tag, false);
  },
});

export const messageDeleteEvent = defineEvent({
  name: Events.MessageDelete,
  execute: async (message: Message | PartialMessage) => {
    if (!message.guild || message.author?.bot) return;
    await logMessageDelete(message.guild, message.channelId, message.author?.id ?? null, message.content ?? "");
  },
});

export const messageUpdateEvent = defineEvent({
  name: Events.MessageUpdate,
  execute: async (
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
  ) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    const before = oldMessage.content ?? "";
    const after = newMessage.content ?? "";
    if (before === after) return; // embed/attachment-only edits, ignore
    await logMessageEdit(newMessage.guild, newMessage.channelId, newMessage.author?.id ?? null, before, after);
  },
});
