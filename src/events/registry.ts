import type { BotEvent } from "../lib/framework.js";
import ready from "./ready.js";
import interactionCreate from "./interactionCreate.js";
import messageCreate from "./messageCreate.js";
import guildMemberAdd from "./guildMemberAdd.js";
import { channelCreateEvent, channelDeleteEvent, channelUpdateEvent } from "./channels.js";
import { roleCreateEvent, roleDeleteEvent, roleUpdateEvent } from "./roles.js";
import { memberRemoveEvent, banAddEvent, banRemoveEvent, messageDeleteEvent, messageUpdateEvent } from "./serverLogs.js";

export const events: BotEvent[] = [
  ready,
  interactionCreate,
  messageCreate,
  guildMemberAdd,
  channelCreateEvent,
  channelDeleteEvent,
  channelUpdateEvent,
  roleCreateEvent,
  roleDeleteEvent,
  roleUpdateEvent,
  memberRemoveEvent,
  banAddEvent,
  banRemoveEvent,
  messageDeleteEvent,
  messageUpdateEvent,
] as BotEvent[];
