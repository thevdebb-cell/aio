import { AttachmentBuilder, type TextChannel } from "discord.js";
import type { TicketRecord } from "../../lib/store/types.js";

/**
 * Build a plain-text transcript of a ticket channel.
 * Returns an attachment ready to be posted to the transcripts channel.
 */
export async function buildTranscript(
  channel: TextChannel,
  ticket: TicketRecord,
): Promise<AttachmentBuilder> {
  const lines: string[] = [];
  lines.push(`Star Customs - ticket transcript`);
  lines.push(`Channel: #${channel.name} (${channel.id})`);
  lines.push(`Kind: ${ticket.kind} | Type: ${ticket.type}`);
  lines.push(`Opened by: ${ticket.ownerId}`);
  lines.push(`Claimed by: ${ticket.claimedBy ?? "-"}`);
  if (ticket.orderId) lines.push(`Order: ${ticket.orderId}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("".padEnd(60, "-"));

  // Fetch up to ~1000 messages, oldest first.
  const collected: { t: number; line: string }[] = [];
  let before: string | undefined;
  for (let i = 0; i < 10; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    for (const m of batch.values()) {
      const when = new Date(m.createdTimestamp).toISOString().slice(0, 19).replace("T", " ");
      const author = `${m.author.tag}`;
      let body = m.content || "";
      if (m.attachments.size) {
        body += ` [attachments: ${[...m.attachments.values()].map((a) => a.url).join(", ")}]`;
      }
      if (m.embeds.length) body += ` [${m.embeds.length} embed(s)]`;
      collected.push({ t: m.createdTimestamp, line: `[${when}] ${author}: ${body}` });
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => a.t - b.t);
  lines.push(...collected.map((c) => c.line));

  const buf = Buffer.from(lines.join("\n"), "utf8");
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}
