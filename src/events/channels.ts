import { Events, type DMChannel, type NonThreadGuildBasedChannel } from "discord.js";
import { defineEvent } from "../lib/framework.js";
import { onChannelCreate, onChannelDelete, onChannelUpdate } from "../modules/antinuke/index.js";

export const channelCreateEvent = defineEvent({
  name: Events.ChannelCreate,
  execute: async (channel: NonThreadGuildBasedChannel) => {
    await onChannelCreate(channel);
  },
});

export const channelDeleteEvent = defineEvent({
  name: Events.ChannelDelete,
  execute: async (channel: DMChannel | NonThreadGuildBasedChannel) => {
    if (!("guild" in channel)) return;
    await onChannelDelete(channel);
  },
});

export const channelUpdateEvent = defineEvent({
  name: Events.ChannelUpdate,
  execute: async (
    oldChannel: DMChannel | NonThreadGuildBasedChannel,
    newChannel: DMChannel | NonThreadGuildBasedChannel,
  ) => {
    if (!("guild" in newChannel) || !("guild" in oldChannel)) return;
    await onChannelUpdate(oldChannel, newChannel);
  },
});
