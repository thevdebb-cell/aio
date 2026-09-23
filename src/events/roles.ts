import { Events, type Role } from "discord.js";
import { defineEvent } from "../lib/framework.js";
import { onRoleCreate, onRoleDelete, onRoleUpdate } from "../modules/antinuke/antinuke.js";

export const roleCreateEvent = defineEvent({
  name: Events.GuildRoleCreate,
  execute: async (role: Role) => {
    await onRoleCreate(role);
  },
});

export const roleDeleteEvent = defineEvent({
  name: Events.GuildRoleDelete,
  execute: async (role: Role) => {
    await onRoleDelete(role);
  },
});

export const roleUpdateEvent = defineEvent({
  name: Events.GuildRoleUpdate,
  execute: async (oldRole: Role, newRole: Role) => {
    await onRoleUpdate(oldRole, newRole);
  },
});
