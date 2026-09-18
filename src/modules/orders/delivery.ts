import {
  ActionRowBuilder,
  type AttachmentBuilder,
  AttachmentBuilder as AB,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type TextChannel,
} from "discord.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { store } from "../../lib/store/index.js";
import { files, linkTtlSeconds } from "../../lib/files/index.js";
import { config } from "../../config/index.js";
import { container, text, ASSETS_DIR } from "../../lib/ui.js";
import { cid } from "../../lib/interactions.js";
import { V2 } from "../tickets/core.js";
import { log } from "../../lib/logger.js";
import type { OrderRecord, Submission } from "../../types/index.js";

export function latestApproved(order: OrderRecord): Submission | null {
  const approved = order.submissions.filter((s) => s.approved);
  return approved.length ? approved[approved.length - 1]! : null;
}

/** Resolve the download target for a submission (signed URL for files, raw for link/id). */
export async function resolveDownload(sub: Submission): Promise<{ label: string; url: string | null; text: string | null }> {
  if ((sub.kind === "file" || sub.kind === "zip") && sub.fileKey) {
    const url = await files().signedUrl(sub.fileKey, linkTtlSeconds());
    return { label: sub.filename ?? "Download", url, text: null };
  }
  if (sub.kind === "link") return { label: "Open link", url: sub.value, text: null };
  return { label: "Delivery reference", url: null, text: sub.value };
}

function readyDmComponents(order: OrderRecord, dl: { label: string; url: string | null; text: string | null }) {
  const c = container();
  const bannerName = config.banners.orderReadyDm;
  const attachFiles: AttachmentBuilder[] = [];
  if (bannerName && existsSync(join(ASSETS_DIR, bannerName))) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerName}`)));
    attachFiles.push(new AB(join(ASSETS_DIR, bannerName), { name: bannerName }));
  }
  // QC-style copy: no periods, no commas
  const lines = ["## Your Order Is Ready", `Order ${order.id}`, `Service ${order.type}`];
  if (dl.text) lines.push(`Reference ${dl.text}`);
  if (dl.url) lines.push(`Your download link is below and expires in ${Number(process.env.DOWNLOAD_LINK_TTL_MINUTES ?? 10)} minutes`);
  c.addTextDisplayComponents(text(lines.join("\n")));

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (dl.url) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(dl.label).setURL(dl.url));
  if (dl.url) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Regen link").setCustomId(cid("orderdl", "regen", order.id)));
  row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Confirm my order").setCustomId(cid("orderconfirm", "start", order.id)));

  return { components: [c, row] as const, files: attachFiles };
}

/**
 * Deliver an order to the buyer: DM the download + post a compact "ready"
 * message with Jump-to-DMs / Help buttons in the order ticket.
 * Returns whether the buyer's DM went through.
 */
export async function deliverOrder(guild: Guild, order: OrderRecord): Promise<{ dmOk: boolean }> {
  const sub = latestApproved(order);
  if (!sub) throw new Error("No approved submission to deliver.");
  const dl = await resolveDownload(sub);

  // DM the buyer.
  let dmOk = false;
  const buyer = await guild.members.fetch(order.buyerId).catch(() => null);
  if (buyer) {
    const dm = readyDmComponents(order, dl);
    const sent = await buyer.send({ flags: V2, components: dm.components as any, files: dm.files }).catch(() => null);
    dmOk = Boolean(sent);
  }

  // Post in the ticket.
  const chan = await guild.channels.fetch(order.channelId).catch(() => null);
  if (chan && chan.type === ChannelType.GuildText) {
    const c = container().addTextDisplayComponents(text("## Order Ready"), text("Your order has been delivered\nCheck your DMs for the download"));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("Jump into my DMs").setCustomId(cid("orderdl", "resend", order.id)),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Help").setCustomId(cid("orderhelp", "open", order.id)),
    );
    await (chan as TextChannel).send({ flags: V2, components: [c, row] }).catch(() => {});
  }

  await store().updateOrder(order.id, { status: "delivered", deliveredAt: order.deliveredAt ?? Date.now() });
  log.info(`[orders] delivered ${order.id} (dmOk=${dmOk})`);
  return { dmOk };
}
