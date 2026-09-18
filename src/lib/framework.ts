import {
  type ChatInputCommandInteraction,
  type ClientEvents,
  type Message,
  type SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";

export interface SlashCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute(interaction: ChatInputCommandInteraction): Promise<void> | void;
}

export interface PrefixCommand {
  name: string;
  aliases?: string[];
  description?: string;
  ownerOnly?: boolean;
  whitelistOnly?: boolean;
  execute(message: Message, args: string[]): Promise<void> | void;
}

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}

export function defineEvent<K extends keyof ClientEvents>(event: BotEvent<K>): BotEvent<K> {
  return event;
}

export const PREFIX = "!";
