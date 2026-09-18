import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type Guild,
} from "discord.js";
import { store, newId } from "../../lib/store/index.js";
import { files } from "../../lib/files/index.js";
import { onButton, onSelect, onModal, cid } from "../../lib/interactions.js";
import { container, text, separator, V2FLAG } from "../../lib/ui.js";
import { CHANNEL, ROLE, V2, supportChannelName, ticketControls } from "../tickets/core.js";
import { createTicketChannel } from "../tickets/create.js";
import { memberHasAnyRole } from "../tickets/handlers.js";
import { deliverOrder, resolveDownload, latestApproved } from "./delivery.js";
import { logOrder } from "./panel.js";
import { log } from "../../lib/logger.js";
import type { SubmissionKind } from "../../types/index.js";

/** Post a submission to the quality-control channel with approve/reject buttons. */
async function postToQc(guild: Guild, orderId: string, subId: string, designerId: string, kind: SubmissionKind, preview: string) {
  const settings = await store().getGuild(guild.id);
  const qcId = settings.channels[CHANNEL.qc];
  if (!qcId) {
    log.warn("[submit] no quality-control channel set — run !setup");
    return;
  }
  const chan = await guild.channels.fetch(qcId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return;

  const c = container().addTextDisplayComponents(
    text("## Quality Control"),
    text([`Order ${orderId}`, `Designer <@${designerId}>`, `Type ${kind}`, `Submission ${preview}`].join("\n")),
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Approve").setCustomId(cid("qc", "approve", orderId, subId)),
    new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel("Reject").setCustomId(cid("qc", "reject", orderId, subId)),
  );
  await (chan as TextChannel).send({ flags: V2FLAG, components: [c, row] });
}

/** Shared: handle one /submit invocation. */
export async function handleSubmit(opts: {
  guild: Guild;
  channel: TextChannel;
  userId: string;
  kind: SubmissionKind;
  value: string;
  attachmentUrl?: string;
  filename?: string;
  contentType?: string;
}): Promise<string> {
  const ticket = await store().getTicket(opts.channel.id);
  if (!ticket || ticket.kind !== "order" || !ticket.orderId) return "This isn't an order ticket.";
  const order = await store().getOrder(ticket.orderId);
  if (!order) return "Linked order not found.";

  const subId = newId("sub");
  let fileKey: string | null = null;
  let filename: string | null = opts.filename ?? null;

  if ((opts.kind === "file" || opts.kind === "zip") && opts.attachmentUrl) {
    const res = await fetch(opts.attachmentUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    fileKey = `orders/${order.id}/${subId}-${(opts.filename ?? "file").replace(/[^\w.-]+/g, "_")}`;
    await files().upload(fileKey, buf, { contentType: opts.contentType ?? "application/octet-stream", filename: opts.filename ?? "download" });
  }

  const submissions = [
    ...order.submissions,
    {
      id: subId,
      kind: opts.kind,
      value: opts.value,
      fileKey,
      filename,
      submittedBy: opts.userId,
      at: Date.now(),
      approved: false,
      approvedBy: null,
    },
  ];
  await store().updateOrder(order.id, { submissions, status: "qc_review" });

  const preview = opts.kind === "link" ? opts.value : opts.kind === "id" ? opts.value : (filename ?? opts.kind);
  await postToQc(opts.guild, order.id, subId, opts.userId, opts.kind, preview);
  await logOrder(opts.guild, await store().getGuild(opts.guild.id), `Order **${order.id}** — new ${opts.kind} submission by <@${opts.userId}> — sent to QC`);
  return `Submitted for quality control (${opts.kind}).`;
}

// ── QC approve / reject ─────────────────────────────────
onButton("qc", async (i: ButtonInteraction, parts) => {
  const [, action, orderId, subId] = parts;
  if (!i.guild) return;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  if (!memberHasAnyRole(member, settings, [ROLE.qc])) {
    await i.reply({ content: "Quality Control only.", ephemeral: true });
    return;
  }
  const order = await store().getOrder(orderId!);
  if (!order) {
    await i.reply({ content: "Order not found.", ephemeral: true });
    return;
  }

  if (action === "reject") {
    const submissions = order.submissions.filter((s) => s.id !== subId);
    await store().updateOrder(orderId!, { submissions, status: order.designerId ? "claimed" : "open" });
    await i.update({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Quality Control"), text(`Submission rejected by ${i.user.tag}`))] });
    const chan = await i.guild.channels.fetch(order.channelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      await (chan as TextChannel).send({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("A submission was rejected by Quality Control the designer will re-submit"))] });
    }
    return;
  }

  // approve
  const submissions = order.submissions.map((s) => (s.id === subId ? { ...s, approved: true, approvedBy: i.user.id } : s));
  const updated = await store().updateOrder(orderId!, { submissions });
  await i.update({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Quality Control"), text(`Approved by ${i.user.tag}`))] });
  try {
    if (updated) await deliverOrder(i.guild, updated);
    await logOrder(i.guild, settings, `Order **${orderId}** approved by <@${i.user.id}> and delivered`);
  } catch (err) {
    log.error("[qc] delivery failed", err);
  }
});

// ── Download: resend / regen ────────────────────────────
onButton("orderdl", async (i: ButtonInteraction, parts) => {
  const [, action, orderId] = parts;
  if (!i.guild) return;
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });

  // Only the buyer can pull their own download.
  if (i.user.id !== order.buyerId) {
    await i.reply({ content: "This is only for the order owner.", ephemeral: true });
    return;
  }
  const sub = latestApproved(order);
  if (!sub) return void i.reply({ content: "Nothing has been delivered yet.", ephemeral: true });
  const dl = await resolveDownload(sub, order.id);

  if (action === "resend") {
    const buyer = await i.guild.members.fetch(order.buyerId).catch(() => null);
    let ok = false;
    if (buyer) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      if (dl.url) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(dl.label).setURL(dl.url));
      const c = container().addTextDisplayComponents(text("## Your Order"), text(dl.text ? `Reference ${dl.text}` : "Your download link is below"));
      ok = Boolean(await buyer.send({ flags: V2, components: dl.url ? [c, row] : [c] }).catch(() => null));
    }
    await i.reply({ content: ok ? "Sent to your DMs." : "I couldn't DM you — please open your DMs, then use Help.", ephemeral: true });
    return;
  }

  // regen (used from the DM) — reply with a fresh link
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (dl.url) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(dl.label).setURL(dl.url));
  row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Regen link").setCustomId(cid("orderdl", "regen", order.id)));
  await i.reply({ flags: V2FLAG, components: [container().addTextDisplayComponents(text("## Fresh Link"), text("Here is a new link it expires again shortly")), row], ephemeral: true });
});

// ── Help flow ───────────────────────────────────────────
onButton("orderhelp", async (i: ButtonInteraction, parts) => {
  const orderId = parts[2];
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  if (i.user.id !== order.buyerId) {
    await i.reply({ content: "Only the order owner can use this.", ephemeral: true });
    return;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid("orderhelp", "sel", orderId!))
    .setPlaceholder("What do you need help with?")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("My DMs are closed, I can't receive the order").setValue("dms_closed"),
      new StringSelectMenuOptionBuilder().setLabel("Other").setValue("other"),
    );
  await i.reply({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], ephemeral: true });
});

onSelect("orderhelp", async (i: StringSelectMenuInteraction, parts) => {
  if (parts[1] !== "sel") return;
  const orderId = parts[2]!;
  const reasonType = i.values[0]!;
  const modal = new ModalBuilder().setCustomId(cid("orderhelp", "modal", orderId, reasonType)).setTitle("Order Help");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("reason").setLabel("Please describe the issue").setStyle(TextInputStyle.Paragraph).setRequired(true),
    ),
  );
  await i.showModal(modal);
});

onModal("orderhelp", async (i: ModalSubmitInteraction, parts) => {
  if (parts[1] !== "modal" || !i.guild) return;
  const orderId = parts[2]!;
  const reasonType = parts[3];
  const order = await store().getOrder(orderId);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });

  await i.deferReply({ ephemeral: true });
  const reason = safe(i, "reason");
  const settings = await store().getGuild(i.guild.id);

  const channel = await createTicketChannel({
    guild: i.guild,
    settings,
    name: supportChannelName("order", i.user.username),
    parentKey: CHANNEL.ticketCategory,
    buyerId: i.user.id,
    staffRoleKeys: [ROLE.support],
    topic: `Order help — ${orderId} — ${i.user.tag}`,
  });
  await store().createTicket({
    channelId: channel.id,
    guildId: i.guild.id,
    kind: "support",
    type: "order",
    ownerId: i.user.id,
    claimedBy: null,
    claimId: ROLE.support,
    createdAt: Date.now(),
    addedUsers: [],
    orderId,
  });

  const c = container().addTextDisplayComponents(
    text("## Order Help"),
    text(`Opened by <@${i.user.id}> for order \`${orderId}\`.`),
    text(`**Issue:** ${reasonType === "dms_closed" ? "DMs closed — can't receive the order" : "Other"}\n${reason}`),
  );
  c.addSeparatorComponents(separator());
  c.addTextDisplayComponents(text(`High Rank can deliver here with \`/order ${orderId}\`.`));
  await channel.send({ flags: V2FLAG, components: [c] });
  await channel.send({ components: [ticketControls(false)] });

  await i.editReply({ content: `A support ticket has been opened: <#${channel.id}>` });
});

function safe(i: ModalSubmitInteraction, id: string): string {
  try {
    return i.fields.getTextInputValue(id).trim();
  } catch {
    return "";
  }
}
