import type { BotEvent } from "../lib/framework.js";
import ready from "./ready.js";
import interactionCreate from "./interactionCreate.js";
import messageCreate from "./messageCreate.js";
import guildMemberAdd from "./guildMemberAdd.js";
import { channelCreateEvent, channelDeleteEvent, channelUpdateEvent } from "./channels.js";

export const events: BotEvent[] = [
  ready,
  interactionCreate,
  messageCreate,
  guildMemberAdd,
  channelCreateEvent,
  channelDeleteEvent,
  channelUpdateEvent,
] as BotEvent[];
