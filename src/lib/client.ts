import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { SlashCommand } from "./framework.js";

export class BotClient extends Client {
  slash = new Collection<string, SlashCommand>();
}

export function createClient(): BotClient {
  return new BotClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
  });
}
