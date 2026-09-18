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
import { store, newId } from "../../lib/store/store.js";
import { onButton, onSelect, onModal, cid } from "../../lib/interactions.js";
import { container, text, V2FLAG, e } from "../../lib/ui.js";
import { config } from "../../config/config.js";
import { CHANNEL, V2 } from "../tickets/core.js";
import { log } from "../../lib/logger.js";

/** pending review draft: `${userId}:${orderId}` -> { stars, comment } */
const pending = new Map<string, { stars: number; comment: string }>();

export function starsText(n: number): string {
  const star = e(config.emojis.star);
  return star ? star.repeat(n) : `${n}/5`;
}

/** Entry point button shown in the delivery/confirm DM: "Leave a review". */
export function reviewButton(orderId: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Leave a review").setCustomId(cid("rating", "start", orderId));
}

onButton("rating", async (i: ButtonInteraction, parts) => {
  const [, action, orderId] = parts;
  const order = await store().getOrder(orderId!);
  if (!order) return void i.reply({ content: "Order not found.", ephemeral: true });
  if (i.user.id !== order.buyerId) return void i.reply({ content: "Only the buyer can review.", ephemeral: true });

  if (action === "start") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(cid("rating", "stars", orderId!))
      .setPlaceholder("How many stars?")
      .addOptions([1, 2, 3, 4, 5].map((n) => new StringSelectMenuOptionBuilder().setLabel(`${n} star${n > 1 ? "s" : ""}`).setValue(String(n))));
    await i.reply({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], ephemeral: true });
    return;
  }

  if (action === "save") {
    const visibility = parts[3]; // "public" | "anon"
    const draft = pending.get(`${i.user.id}:${orderId}`);
    if (!draft) return void i.reply({ content: "Your review draft expired — start again.", ephemeral: true });
    pending.delete(`${i.user.id}:${orderId}`);

    const anonymous = visibility === "anon";
    await store().addRating({
      id: newId("rate"),
      orderId: orderId!,
      designerId: order.designerId ?? "unknown",
      buyerId: i.user.id,
      stars: draft.stars,
      comment: draft.comment || null,
      anonymous,
      createdAt: Date.now(),
    });

    // DM the designer.
    if (order.designerId && i.guild) {
      const designer = await i.guild.members.fetch(order.designerId).catch(() => null);
      if (designer) {
        const who = anonymous ? "an anonymous buyer" : `<@${i.user.id}>`;
        const c = container().addTextDisplayComponents(
          text("## New Review"),
          text([`Order ${orderId}`, `From ${who}`, `Rating ${starsText(draft.stars)}`, draft.comment ? `Comment ${draft.comment}` : ""].filter(Boolean).join("\n")),
        );
        await designer.send({ flags: V2, components: [c] }).catch(() => {});
      }
    }

    // Post to the reviews channel (buyer shown only when public).
    if (i.guild) await postReview(i.guild, orderId!, order.designerId, i.user.id, draft.stars, draft.comment, anonymous);

    await i.update({ components: [], content: "Thanks — your review has been recorded." });
    return;
  }
});

onSelect("rating", async (i: StringSelectMenuInteraction, parts) => {
  if (parts[1] !== "stars") return;
  const orderId = parts[2]!;
  const stars = Number(i.values[0]);
  const modal = new ModalBuilder().setCustomId(cid("rating", "modal", orderId, String(stars))).setTitle("Leave a review");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("comment").setLabel("Comment (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false),
    ),
  );
  await i.showModal(modal);
});

onModal("rating", async (i: ModalSubmitInteraction, parts) => {
  if (parts[1] !== "modal") return;
  const orderId = parts[2]!;
  const stars = Number(parts[3]);
  let comment = "";
  try {
    comment = i.fields.getTextInputValue("comment").trim();
  } catch {
    /* optional */
  }
  pending.set(`${i.user.id}:${orderId}`, { stars, comment });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel("Post publicly").setCustomId(cid("rating", "save", orderId, "public")),
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Post anonymously").setCustomId(cid("rating", "save", orderId, "anon")),
  );
  await i.reply({
    flags: V2FLAG,
    components: [container().addTextDisplayComponents(text("## Almost done"), text(`Rating ${starsText(stars)}\nChoose how to post your review`)), row],
    ephemeral: true,
  });
});

async function postReview(guild: Guild, orderId: string, designerId: string | null, buyerId: string, stars: number, comment: string, anonymous: boolean) {
  const settings = await store().getGuild(guild.id);
  const chanId = settings.channels[CHANNEL.reviews];
  if (!chanId) return;
  const chan = await guild.channels.fetch(chanId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return;
  const who = anonymous ? "Anonymous" : `<@${buyerId}>`;
  const c = container().addTextDisplayComponents(
    text("## Review"),
    text([`Designer ${designerId ? `<@${designerId}>` : "—"}`, `From ${who}`, `Rating ${starsText(stars)}`, comment ? `Comment ${comment}` : ""].filter(Boolean).join("\n")),
  );
  await (chan as TextChannel).send({ flags: V2FLAG, components: [c] }).catch(() => {});
  log.debug(`[ratings] review posted for order ${orderId} (anon=${anonymous})`);
}
