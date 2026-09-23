import {
  type ButtonInteraction,
  ChannelType,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { onButton } from "../../lib/interactions.js";
import { store } from "../../lib/store/store.js";
import type { GuildSettings, TicketRecord } from "../../lib/store/types.js";
import { isOwner } from "../../config/config.js";
import { log } from "../../lib/logger.js";
import {
  ROLE,
  CHANNEL,
  SUPPORT_PREFIX,
  orderChannelName,
  supportChannelName,
  editControlsPanel,
  ticketOverwrites,
  dmClaimed,
} from "./core.js";
import type { GuildSettings as GS } from "../../lib/store/types.js";
import { buildTranscript } from "./transcript.js";

/** Resolve the team role that owns a ticket (designer role for orders, support/HR for support). */
function teamRoleId(ticket: TicketRecord, settings: GS): string | null {
  const key = staffRoleKeysFor(ticket)[0];
  return key ? (settings.roles[key] ?? null) : null;
}

/** Rename a ticket channel for the given claim state (orders and support both get the emoji lead). */
async function renameForClaim(channel: TextChannel, ticket: TicketRecord, claimed: boolean, designer?: string, ownerName?: string, queue?: number) {
  if (ticket.kind === "order") {
    await channel.setName(orderChannelName({ claimed, type: ticket.type, user: ownerName ?? "user", designer, queue })).catch(() => {});
  } else {
    const prefix = SUPPORT_PREFIX[ticket.type] ?? ticket.type;
    await channel.setName(supportChannelName(prefix, ownerName ?? "user", { claimed, designer })).catch(() => {});
  }
}

/** Which role keys are allowed to claim/act on a ticket of this type. */
export function staffRoleKeysFor(ticket: TicketRecord): string[] {
  if (ticket.kind === "order") return [ROLE.designer(ticket.type)];
  // support tickets
  if (ticket.type === "highrank") return [ROLE.highrank];
  return [ROLE.support];
}

export function memberHasAnyRole(member: GuildMember, settings: GuildSettings, keys: string[]): boolean {
  if (isOwner(member.id)) return true;
  const hr = settings.roles[ROLE.highrank];
  if (hr && member.roles.cache.has(hr)) return true;
  return keys.some((k) => {
    const id = settings.roles[k];
    return id ? member.roles.cache.has(id) : false;
  });
}

async function loadContext(i: ButtonInteraction) {
  if (!i.guild) return null;
  const channel = i.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  const ticket = await store().getTicket(channel.id);
  if (!ticket) return null;
  const settings = await store().getGuild(i.guild.id);
  const member = await i.guild.members.fetch(i.user.id);
  return { channel: channel as TextChannel, ticket, settings, member };
}

// ── Claim ──────────────────────────────────────────────
onButton("ticket", async (i, parts) => {
  const action = parts[1];
  if (action === "claim") return handleClaim(i);
  if (action === "unclaim") return handleUnclaim(i);
  if (action === "close") return handleClose(i, false);
  if (action === "cancel") return handleClose(i, true);
});

async function handleClaim(i: ButtonInteraction) {
  const ctx = await loadContext(i);
  if (!ctx) return void i.reply({ content: "This isn't an active ticket.", ephemeral: true });
  const { channel, ticket, settings, member } = ctx;

  if (ticket.claimedBy) {
    return void i.reply({ content: "This ticket is already claimed.", ephemeral: true });
  }
  const keys = staffRoleKeysFor(ticket);
  if (!memberHasAnyRole(member, settings, keys)) {
    return void i.reply({ content: "You can't claim this type of ticket.", ephemeral: true });
  }

  await i.deferUpdate();

  // Compute queue for order tickets = open order tickets of this type.
  let queue: number | undefined;
  if (ticket.kind === "order") {
    const open = await store().listTicketsByType(ticket.guildId, ticket.type);
    queue = open.length; // includes this one; a simple workload indicator
  }

  await store().updateTicket(channel.id, { claimedBy: member.id });

  // Reflect the claim on the linked order record.
  if (ticket.kind === "order" && ticket.orderId) {
    await store().updateOrder(ticket.orderId, { designerId: member.id, status: "claimed", claimedAt: Date.now() });
  }

  // Re-lock permissions to the claimer and rename order channels.
  await channel.permissionOverwrites.set(
    ticketOverwrites({
      guild: i.guild!,
      settings,
      buyerId: ticket.ownerId,
      staffRoleKeys: keys,
      claimerId: member.id,
      extraUserIds: ticket.addedUsers,
    }),
  );
  const opener = await i.guild!.members.fetch(ticket.ownerId).catch(() => null);
  const ownerName = opener?.user.username ?? "user";
  await renameForClaim(channel, ticket, true, member.user.username, ownerName, queue);

  // Edit the ONE control panel in place (claimed note + close button) - never resend.
  await editControlsPanel(channel, ticket.panelMessageId, { claimed: true, claimerId: member.id });

  // DM the opener.
  if (opener) await dmClaimed(opener, channel, member.user.tag);

  // Small plain (non-embed, no buttons) claim notice.
  const label = ticket.kind === "order" ? "Order" : "Ticket";
  await channel.send({ content: `${label} claimed by <@${member.id}>`, allowedMentions: { parse: [] } }).catch(() => {});
}

async function handleUnclaim(i: ButtonInteraction) {
  const ctx = await loadContext(i);
  if (!ctx) return void i.reply({ content: "This isn't an active ticket.", ephemeral: true });
  const { channel, ticket, settings, member } = ctx;

  if (!ticket.claimedBy) return void i.reply({ content: "This ticket isn't claimed.", ephemeral: true });
  const keys = staffRoleKeysFor(ticket);
  const isClaimer = ticket.claimedBy === member.id;
  if (!isClaimer && !memberHasAnyRole(member, settings, [ROLE.highrank])) {
    return void i.reply({ content: "Only the claimer or high rank can unclaim.", ephemeral: true });
  }

  await i.deferUpdate();
  await store().updateTicket(channel.id, { claimedBy: null });
  await channel.permissionOverwrites.set(
    ticketOverwrites({
      guild: i.guild!,
      settings,
      buyerId: ticket.ownerId,
      staffRoleKeys: keys,
      claimerId: null,
      extraUserIds: ticket.addedUsers,
    }),
  );
  const opener = await i.guild!.members.fetch(ticket.ownerId).catch(() => null);
  const ownerName = opener?.user.username ?? "user";
  await renameForClaim(channel, ticket, false, undefined, ownerName);

  // Edit the panel back to unclaimed and re-ping the team.
  await editControlsPanel(channel, ticket.panelMessageId, { claimed: false, pingRoleId: teamRoleId(ticket, settings) });
  await channel.send({ content: `Unclaimed by <@${member.id}> - available to claim again`, allowedMentions: { parse: [] } }).catch(() => {});
}

async function handleClose(i: ButtonInteraction, isCancel: boolean) {
  const ctx = await loadContext(i);
  if (!ctx) return void i.reply({ content: "This isn't an active ticket.", ephemeral: true });
  const { channel, ticket, settings, member } = ctx;

  const keys = staffRoleKeysFor(ticket);
  const isClaimer = ticket.claimedBy === member.id;
  const canClose =
    isCancel
      ? memberHasAnyRole(member, settings, keys)
      : isClaimer || memberHasAnyRole(member, settings, [ROLE.highrank]);
  if (!canClose) {
    return void i.reply({
      content: isCancel ? "You can't cancel this ticket." : "Only the claimer or high rank can close.",
      ephemeral: true,
    });
  }

  await i.reply({ content: `${isCancel ? "Cancelling" : "Closing"} ticket…`, ephemeral: true });

  // Transcript to the transcripts channel.
  try {
    const transcriptChanId = settings.channels[CHANNEL.transcripts];
    if (transcriptChanId) {
      const tChan = await i.guild!.channels.fetch(transcriptChanId).catch(() => null);
      if (tChan && tChan.type === ChannelType.GuildText) {
        const file = await buildTranscript(channel, ticket);
        await (tChan as TextChannel).send({
          content: `Transcript - #${channel.name} (${ticket.kind}/${ticket.type}) - closed by ${member.user.tag}`,
          files: [file],
        });
      }
    }
  } catch (err) {
    log.error("[tickets] transcript failed", err);
  }

  await store().deleteTicket(channel.id);
  await channel.delete().catch(() => {});
}

log.debug("[tickets] handlers registered");
