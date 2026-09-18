import { ChannelType, type Message } from "discord.js";
import { store } from "../../lib/store/store.js";

/**
 * In order tickets, nobody may post raw images/files — designers must use
 * `/sendimage` (watermarked) or `/submit`. This deletes any human message that
 * carries an attachment in an order ticket and leaves a short, self-deleting note.
 * Returns true if it acted (so the caller can stop processing the message).
 */
export async function enforceOrderMedia(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;
  if (!message.channel || message.channel.type !== ChannelType.GuildText) return false;
  if (message.attachments.size === 0) return false;

  const ticket = await store().getTicket(message.channel.id);
  if (!ticket || ticket.kind !== "order") return false;

  await message.delete().catch(() => {});
  const warn = await message.channel
    .send({ content: `<@${message.author.id}> images and files can't be posted here directly. Designers, use \`/sendimage\` or \`/submit\`.` })
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
  return true;
}
