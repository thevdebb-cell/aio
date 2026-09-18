import type { Message } from "discord.js";

interface AfkState {
  reason: string;
  since: number;
}

const afk = new Map<string, AfkState>(); // userId -> state

export function setAfk(userId: string, reason: string) {
  afk.set(userId, { reason: reason || "AFK", since: Date.now() });
}

export function clearAfk(userId: string): AfkState | null {
  const s = afk.get(userId);
  if (s) afk.delete(userId);
  return s ?? null;
}

export function isAfk(userId: string): AfkState | null {
  return afk.get(userId) ?? null;
}

/**
 * On every guild message: clear the author's AFK if set, and notify when
 * AFK users are mentioned. Returns nothing; safe to call before command parsing.
 */
export async function handleAfkMessage(message: Message) {
  if (message.author.bot || !message.guild) return;

  // Author came back.
  const mine = clearAfk(message.author.id);
  if (mine) {
    const m = await message.reply({ content: `Welcome back <@${message.author.id}>, I removed your AFK.` }).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 6000);
  }

  // Mentioned someone who is AFK.
  const notes: string[] = [];
  for (const [id, user] of message.mentions.users) {
    if (id === message.author.id) continue;
    const state = isAfk(id);
    if (state) notes.push(`${user.username} is AFK: ${state.reason}`);
  }
  if (notes.length) {
    const m = await message.reply({ content: notes.join("\n") }).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 8000);
  }
}
