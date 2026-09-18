import { Events, type Interaction } from "discord.js";
import { defineEvent } from "../lib/framework.js";
import type { BotClient } from "../lib/client.js";
import { routeButton, routeSelect, routeModal } from "../lib/interactions.js";
import { log } from "../lib/logger.js";

export default defineEvent({
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const client = interaction.client as BotClient;
        const cmd = client.slash.get(interaction.commandName);
        if (!cmd) return;
        await cmd.execute(interaction);
        return;
      }
      if (interaction.isButton()) return void routeButton(interaction);
      if (interaction.isStringSelectMenu()) return void routeSelect(interaction);
      if (interaction.isModalSubmit()) return void routeModal(interaction);
    } catch (err) {
      log.error("[interactionCreate] error", err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
      }
    }
  },
});
