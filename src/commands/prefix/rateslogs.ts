import type { PrefixCommand } from "../../lib/framework.js";
import { out } from "../../lib/msg.js";
import { container, text, V2FLAG } from "../../lib/ui.js";
import { store } from "../../lib/store/store.js";
import { starsText } from "../../modules/orders/ratings.js";

/** WL-only: full, unmasked review log (shows the buyer even for anonymous reviews). */
export const rateslogs: PrefixCommand = {
  name: "rateslogs",
  description: "Whitelist: full review log (unmasked)",
  whitelistOnly: true,
  execute: async (message) => {
    const ratings = await store().listRatings();
    const recent = ratings.slice(-25).reverse();
    const body = recent.length
      ? recent
          .map(
            (r) =>
              `<t:${Math.floor(r.createdAt / 1000)}:d> • designer <@${r.designerId}> • buyer <@${r.buyerId}>` +
              `${r.anonymous ? " (anonymous)" : ""} • ${starsText(r.stars)}${r.comment ? ` • ${r.comment}` : ""}`,
          )
          .join("\n")
      : "No reviews yet.";
    const c = container().addTextDisplayComponents(text("## Reviews (unmasked)"), text(body));
    await out(message).send({ flags: V2FLAG, components: [c] });
  },
};
