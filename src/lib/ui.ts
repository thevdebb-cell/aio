/**
 * Components V2 helpers.
 *
 * House rules for every panel/embed in this bot:
 *  - Components V2 only (ContainerBuilder), never legacy embeds.
 *  - Accent colour is black.
 *  - NEVER a footer.
 *  - NEVER a hardcoded emoji. Emojis come only from config.emojis (added by the owner).
 *
 * Banners are local PNG/JPG files in the `assets/` folder, referenced as
 * attachment://<filename>. Attach them to the message via bannerFiles().
 */
import {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Prefer an explicit ASSETS_DIR, else <cwd>/assets (works when bundled to a
// single file), else the path relative to this module (source/dist layouts).
export const ASSETS_DIR =
  process.env.ASSETS_DIR ??
  (existsSync(join(process.cwd(), "assets")) ? join(process.cwd(), "assets") : join(__dirname, "..", "..", "assets"));

/** Embed/accent colour used everywhere: black. */
export const BLACK = 0x000000;

/** Components V2 message flag — every panel/embed message uses it. */
export const V2FLAG = MessageFlags.IsComponentsV2;

export function text(markdown: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(markdown);
}

export function separator(large = false): SeparatorBuilder {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

export function banner(filename: string): MediaGalleryBuilder {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(`attachment://${filename}`),
  );
}

/** A fresh black container. */
export function container(): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(BLACK);
}

/**
 * Build the AttachmentBuilder list for the given banner filenames.
 * Missing files are skipped with a warning so a missing asset never crashes a send;
 * the banner simply won't render until the file is uploaded to assets/.
 */
export function bannerFiles(...filenames: string[]): AttachmentBuilder[] {
  const files: AttachmentBuilder[] = [];
  for (const name of filenames) {
    if (!name) continue;
    const path = join(ASSETS_DIR, name);
    if (!existsSync(path)) {
      log.warn(`[ui] banner asset missing: assets/${name} (panel will render without it)`);
      continue;
    }
    files.push(new AttachmentBuilder(path, { name }));
  }
  return files;
}

/**
 * Returns the config emoji string for use in a label/markdown, or "" if the
 * owner hasn't set it yet. Never invents an emoji.
 */
export function e(value: string | undefined | null): string {
  return value && value.trim().length > 0 ? value.trim() : "";
}
