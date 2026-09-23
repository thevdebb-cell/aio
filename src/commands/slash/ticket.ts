import { ChannelType, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import {
  ROLE,
  ticketOverwrites,
  orderChannelName,
  supportChannelName,
  sendControlsPanel,
} from "../../modules/tickets/core.js";
import { memberHasAnyRole, staffRoleKeysFor } from "../../modules/tickets/handlers.js";
import type { SupportCategory } from "../../types/types.js";

const SUPPORT_PREFIX: Record<string, string> = {
  general: "general",
  order: "order",
  highrank: "management",
  report: "report",
  bug: "bug",
};

export const ticket: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket management")
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add a user to this ticket").addUserOption((o) => o.setName("user").setDescription("User to add").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("escalated")
        .setDescription("Escalate this ticket to another section")
        .addStringOption((o) =>
          o
            .setName("section")
            .setDescription("Target section")
            .setRequired(true)
            .addChoices(
              { name: "Management", value: "highrank" },
              { name: "General", value: "general" },
              { name: "Order", value: "order" },
              { name: "Report", value: "report" },
              { name: "Bug", value: "bug" },
            ),
        ),
    ),
  execute: async (i) => {
    if (!i.guild || !i.channel || i.channel.type !== ChannelType.GuildText) {
      await i.reply({ content: "Use this inside a ticket.", ephemeral: true });
      return;
    }
    const channel = i.channel as TextChannel;
    const ticketRec = await store().getTicket(channel.id);
    if (!ticketRec) {
      await i.reply({ content: "This isn't a ticket.", ephemeral: true });
      return;
    }
    const settings = await store().getGuild(i.guild.id);
    const member = await i.guild.members.fetch(i.user.id);
    if (!memberHasAnyRole(member, settings, staffRoleKeysFor(ticketRec))) {
      await i.reply({ content: "You can't manage this ticket.", ephemeral: true });
      return;
    }

    const sub = i.options.getSubcommand();

    if (sub === "add") {
      const user = i.options.getUser("user", true);
      const added = Array.from(new Set([...ticketRec.addedUsers, user.id]));
      await store().updateTicket(channel.id, { addedUsers: added });
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
      const c = container().addTextDisplayComponents(text(`<@${user.id}> has been added to the ticket.`));
      await channel.send({ flags: V2FLAG, components: [c] });
      await i.reply({ content: "Added.", ephemeral: true });
      return;
    }

    if (sub === "escalated") {
      const section = i.options.getString("section", true) as SupportCategory;
      const keys = section === "highrank" ? [ROLE.highrank] : [ROLE.support];
      await store().updateTicket(channel.id, { type: section, claimedBy: null, claimId: keys[0]! });

      // Reset perms to the new pool (unclaimed) and rename.
      await channel.permissionOverwrites.set(
        ticketOverwrites({ guild: i.guild, settings, buyerId: ticketRec.ownerId, staffRoleKeys: keys, claimerId: null, extraUserIds: ticketRec.addedUsers }),
      );
      const newName =
        ticketRec.kind === "order"
          ? orderChannelName({ claimed: false, type: section, user: ticketRec.ownerId })
          : supportChannelName(SUPPORT_PREFIX[section] ?? section, (await i.guild.members.fetch(ticketRec.ownerId).catch(() => null))?.user.username ?? "user");
      await channel.setName(newName).catch(() => {});

      const c = container().addTextDisplayComponents(
        text(`## Escalated`),
        text(`This ticket has been escalated to **${section}** by <@${i.user.id}>. It is now unclaimed for that team.`),
      );
      await channel.send({ flags: V2FLAG, components: [c] });
      const pingRoleId = settings.roles[keys[0] ?? ""] ?? null;
      const panel = await sendControlsPanel(channel, { claimed: false, pingRoleId });
      await store().updateTicket(channel.id, { panelMessageId: panel.id });
      await i.reply({ content: "Escalated.", ephemeral: true });
    }
  },
};
