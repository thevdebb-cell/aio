import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { log } from "./logger.js";

/**
 * Interaction routing by customId.
 * Convention: "<namespace>:<action>:<...args>" split on ":".
 * Handlers register on the namespace and receive the parsed parts.
 */
type ButtonHandler = (i: ButtonInteraction, parts: string[]) => Promise<void> | void;
type SelectHandler = (i: StringSelectMenuInteraction, parts: string[]) => Promise<void> | void;
type ModalHandler = (i: ModalSubmitInteraction, parts: string[]) => Promise<void> | void;

const buttons = new Map<string, ButtonHandler>();
const selects = new Map<string, SelectHandler>();
const modals = new Map<string, ModalHandler>();

export function onButton(ns: string, h: ButtonHandler) {
  buttons.set(ns, h);
}
export function onSelect(ns: string, h: SelectHandler) {
  selects.set(ns, h);
}
export function onModal(ns: string, h: ModalHandler) {
  modals.set(ns, h);
}

export function cid(ns: string, ...args: (string | number)[]): string {
  return [ns, ...args].join(":");
}

export async function routeButton(i: ButtonInteraction) {
  const parts = i.customId.split(":");
  const h = buttons.get(parts[0]!);
  if (!h) return;
  await safe(() => h(i, parts), i);
}

export async function routeSelect(i: StringSelectMenuInteraction) {
  const parts = i.customId.split(":");
  const h = selects.get(parts[0]!);
  if (!h) return;
  await safe(() => h(i, parts), i);
}

export async function routeModal(i: ModalSubmitInteraction) {
  const parts = i.customId.split(":");
  const h = modals.get(parts[0]!);
  if (!h) return;
  await safe(() => h(i, parts), i);
}

async function safe(
  fn: () => Promise<void> | void,
  i: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
) {
  try {
    await fn();
  } catch (err) {
    log.error(`[interaction] handler error for ${i.customId}`, err);
    try {
      if (i.isRepliable() && !i.replied && !i.deferred) {
        await i.reply({ content: "Something went wrong handling that action.", ephemeral: true });
      }
    } catch {
      /* ignore */
    }
  }
}
