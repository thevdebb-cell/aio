import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { SlashCommand } from "../../lib/framework.js";
import { store } from "../../lib/store/store.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { recordAndLog } from "../../modules/moderation/util.js";

async function gateHr(i: ChatInputCommandInteraction): Promise<boolean> {
  if (!i.guild) return false;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  if (memberHasAnyRole(member, settings, [ROLE.highrank])) return true;
  await i.reply({ content: "High Rank only.", ephemeral: true });
  return false;
}

const infraction: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("infraction")
    .setDescription("Issue an infraction")
    .addSubcommand((s) =>
      s
        .setName("issue")
        .setDescription("Issue an infraction to a staff member or designer")
        .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))
        .addStringOption((o) => o.setName("type").setDescription("Target group").setRequired(true).addChoices({ name: "Staff", value: "staff" }, { name: "Designer", value: "designer" }))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
        .addStringOption((o) => o.setName("punishment").setDescription("Punishment / action taken").setRequired(false)),
    ),
  execute: async (i) => {
    if (!(await gateHr(i))) return;
    const user = i.options.getUser("user", true);
    const category = i.options.getString("type", true) as "staff" | "designer";
    const reason = i.options.getString("reason", true);
    const punishment = i.options.getString("punishment") ?? "";
    await i.deferReply({ ephemeral: true });
    await i.guild!.members
      .fetch(user.id)
      .then((m) => m.send(`You received a ${category} infraction in ${i.guild!.name}.\nReason: ${reason}${punishment ? `\nAction: ${punishment}` : ""}`).catch(() => {}))
      .catch(() => {});
    await recordAndLog(i.guild!, { type: "infraction", category, targetId: user.id, moderatorId: i.user.id, reason, extra: punishment || null }, "Infraction Issued");
    await i.editReply({ content: `Infraction issued to <@${user.id}> (${category}).` });
  },
};

const promotion: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("promotion")
    .setDescription("Issue a promotion")
    .addSubcommand((s) =>
      s
        .setName("issue")
        .setDescription("Promote a staff member or designer")
        .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))
        .addStringOption((o) => o.setName("type").setDescription("Target group").setRequired(true).addChoices({ name: "Staff", value: "staff" }, { name: "Designer", value: "designer" }))
        .addStringOption((o) => o.setName("rank").setDescription("New rank / role").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    ),
  execute: async (i) => {
    if (!(await gateHr(i))) return;
    const user = i.options.getUser("user", true);
    const category = i.options.getString("type", true) as "staff" | "designer";
    const rank = i.options.getString("rank", true);
    const reason = i.options.getString("reason") ?? "";
    await i.deferReply({ ephemeral: true });
    await i.guild!.members
      .fetch(user.id)
      .then((m) => m.send(`Congratulations — you were promoted in ${i.guild!.name}.\nNew rank: ${rank}${reason ? `\nReason: ${reason}` : ""}`).catch(() => {}))
      .catch(() => {});
    await recordAndLog(i.guild!, { type: "promotion", category, targetId: user.id, moderatorId: i.user.id, reason, extra: rank }, "Promotion Issued");
    await i.editReply({ content: `Promotion issued to <@${user.id}> → ${rank}.` });
  },
};

export const staffCommands: SlashCommand[] = [infraction, promotion];
