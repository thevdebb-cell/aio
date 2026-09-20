import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SlashCommand } from "../../lib/framework.js";
import { store, newId } from "../../lib/store/store.js";
import { container, text, separator, V2FLAG, ASSETS_DIR } from "../../lib/ui.js";
import { ROLE } from "../../modules/tickets/core.js";
import { memberHasAnyRole } from "../../modules/tickets/handlers.js";
import { onButton, cid } from "../../lib/interactions.js";
import { recordAndLog } from "../../modules/moderation/util.js";
import { isOwner } from "../../config/config.js";

const INFRACT_BLUE = 0x3b6fb0;
const INFRACT_GREY = 0x4a4a52;
const BANNER = "INFRACTIONS.png";

async function gateHr(i: ChatInputCommandInteraction): Promise<boolean> {
  if (!i.guild) return false;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  if (memberHasAnyRole(member, settings, [ROLE.highrank])) return true;
  await i.reply({ content: "High Rank only.", ephemeral: true });
  return false;
}

function shortCase(): string {
  return newId("case").split("_")[1]!.slice(0, 8).toUpperCase();
}

function infractionDescription(category: string): string {
  if (category === "Abuse")
    return "This infraction was issued following an **abuse or raid attempt** against the server or the staff team. Such behaviour is taken very seriously and is fully documented by Higher Inspection.";
  if (category === "HI Case")
    return "This infraction is part of a **Higher Inspection case**. It follows an internal review of staff conduct. Please cooperate with Higher Inspection regarding this matter.";
  return "Unfortunately you have received a staff infraction due to a violation of staff expectations and guidelines. We expect all staff members to remain professional and follow server policies at all times.";
}

function bannerFiles(): AttachmentBuilder[] {
  const p = join(ASSETS_DIR, BANNER);
  return existsSync(p) ? [new AttachmentBuilder(p, { name: BANNER })] : [];
}

function buildInfraction(inf: {
  caseId: string;
  category: string;
  type: string;
  reason: string;
  userId: string;
  issuedById: string;
  notes: string;
  expiration: string;
  proof: string;
  revokedBy?: string | null;
}) {
  const revoked = Boolean(inf.revokedBy);
  const title = revoked ? "Staff Infraction - Revoked" : `Staff Infraction${inf.category === "Abuse" ? " - Abuse" : inf.category === "HI Case" ? " - HI" : ""}`;
  const lines = [
    `**Infraction Type:** ${inf.type}`,
    `**Reason:** ${inf.reason}`,
    `**User:** <@${inf.userId}>`,
    `**Issued by:** <@${inf.issuedById}>`,
    `**Notes:** ${inf.notes || "None"}`,
    `**Expiration:** ${inf.expiration || "Permanent"}`,
  ];
  if (inf.proof) lines.push(`**Proof:** ${inf.proof}`);
  lines.push(`**Case ID:** ${inf.caseId}`);
  if (revoked) lines.push(`\n**This infraction has been revoked by <@${inf.revokedBy}>**`);

  const c = container()
    .setAccentColor(revoked ? INFRACT_GREY : INFRACT_BLUE)
    .addTextDisplayComponents(text(`## ${title}`), text(infractionDescription(inf.category)))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(lines.join("\n")));

  const files = bannerFiles();
  if (files.length) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${BANNER}`)));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel(revoked ? "Revoked" : "Revoke").setCustomId(cid("infract", "revoke", inf.caseId)).setDisabled(revoked),
  );
  return { components: [c, row], files };
}

const infraction: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("infraction")
    .setDescription("Issue a staff infraction")
    .addSubcommand((s) =>
      s
        .setName("issue")
        .setDescription("Issue a staff infraction")
        .addUserOption((o) => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption((o) => o.setName("type").setDescription("Infraction type (e.g. Warning, Strike, Suspension)").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
        .addStringOption((o) =>
          o.setName("category").setDescription("Category").addChoices({ name: "Normal", value: "Normal" }, { name: "HI Case", value: "HI Case" }, { name: "Abuse", value: "Abuse" }),
        )
        .addStringOption((o) => o.setName("notes").setDescription("Notes"))
        .addStringOption((o) => o.setName("expiration").setDescription("Expiration (e.g. 7 days, Permanent)"))
        .addStringOption((o) => o.setName("proof").setDescription("Proof link")),
    ),
  execute: async (i) => {
    if (!(await gateHr(i))) return;
    const user = i.options.getUser("user", true);
    const inf = {
      caseId: shortCase(),
      category: i.options.getString("category") ?? "Normal",
      type: i.options.getString("type", true),
      reason: i.options.getString("reason", true),
      userId: user.id,
      issuedById: i.user.id,
      notes: i.options.getString("notes") ?? "",
      expiration: i.options.getString("expiration") ?? "",
      proof: i.options.getString("proof") ?? "",
    };
    await i.deferReply({ ephemeral: true });

    await recordAndLog(
      i.guild!,
      { type: "infraction", category: "staff", targetId: user.id, moderatorId: i.user.id, reason: inf.reason, extra: `${inf.type} | case ${inf.caseId}` },
      "Infraction Issued",
    );

    const payload = buildInfraction(inf);
    // DM the user (no buttons in DM).
    await i.guild!.members.fetch(user.id).then((m) => m.send({ flags: V2FLAG, components: [payload.components[0]], files: payload.files }).catch(() => {})).catch(() => {});
    // Post in the current channel with the revoke button.
    if (i.channel && "send" in i.channel) {
      await (i.channel as any).send({ flags: V2FLAG, components: payload.components, files: payload.files }).catch(() => {});
    }
    await i.editReply({ content: `Infraction issued to <@${user.id}> — case \`${inf.caseId}\`.` });
  },
};

// Revoke button (High Rank / owner).
onButton("infract", async (i: ButtonInteraction, parts) => {
  if (parts[1] !== "revoke" || !i.guild) return;
  const caseId = parts[2]!;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  if (!isOwner(i.user.id) && !memberHasAnyRole(member, settings, [ROLE.highrank])) {
    await i.reply({ content: "High Rank only.", ephemeral: true });
    return;
  }
  await i.update({
    flags: V2FLAG,
    components: [
      container().setAccentColor(INFRACT_GREY).addTextDisplayComponents(text("## Staff Infraction - Revoked"), text(`Case \`${caseId}\` has been revoked by <@${i.user.id}>`)),
    ],
  }).catch(() => {});
});

const promotion: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("promotion")
    .setDescription("Issue a promotion")
    .addSubcommand((s) =>
      s
        .setName("issue")
        .setDescription("Promote a staff member or designer")
        .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))
        .addStringOption((o) => o.setName("type").setDescription("Group").setRequired(true).addChoices({ name: "Staff", value: "staff" }, { name: "Designer", value: "designer" }))
        .addStringOption((o) => o.setName("rank").setDescription("New rank").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    ),
  execute: async (i) => {
    if (!(await gateHr(i))) return;
    const user = i.options.getUser("user", true);
    const category = i.options.getString("type", true) as "staff" | "designer";
    const rank = i.options.getString("rank", true);
    const reason = i.options.getString("reason") ?? "";
    await i.deferReply({ ephemeral: true });
    await i.guild!.members.fetch(user.id).then((m) => m.send(`Congratulations you were promoted in ${i.guild!.name}\nNew rank ${rank}${reason ? `\nReason ${reason}` : ""}`).catch(() => {})).catch(() => {});
    await recordAndLog(i.guild!, { type: "promotion", category, targetId: user.id, moderatorId: i.user.id, reason, extra: rank }, "Promotion Issued");
    await i.editReply({ content: `Promotion issued to <@${user.id}> to ${rank}.` });
  },
};

export const staffCommands: SlashCommand[] = [infraction, promotion];
