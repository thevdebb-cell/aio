import sharp from "sharp";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ASSETS_DIR } from "../../lib/ui.js";
import { log } from "../../lib/logger.js";

const WATERMARK_TEXT = "STAR CUSTOMS";

/** Escape text for safe embedding in SVG. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A tiled, semi-transparent diagonal watermark the size of the image.
 * Repeated so it can't be cropped out, light enough that the art stays visible.
 */
function watermarkSvg(width: number, height: number): Buffer {
  const step = Math.max(180, Math.round(Math.min(width, height) / 3));
  const fontSize = Math.max(18, Math.round(step / 9));
  const rows: string[] = [];
  for (let y = -step; y < height + step; y += step) {
    for (let x = -step; x < width + step; x += step) {
      rows.push(
        `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" ` +
          `fill="#ffffff" fill-opacity="0.12" transform="rotate(-30 ${x} ${y})">${esc(WATERMARK_TEXT)}</text>`,
      );
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rows.join("")}</svg>`);
}

export interface WatermarkResult {
  buffer: Buffer;
  filename: string;
  wasTransparent: boolean;
}

/**
 * Anti-theft processing for a delivered/preview image:
 *  - transparent PNGs are flattened onto a background (assets/art_bg.png, else
 *    a dark fill) so the clean logo can't just be lifted out;
 *  - a repeated semi-transparent "STAR CUSTOMS" watermark is laid over the top.
 *
 * Falls back to returning the original bytes if processing fails.
 */
export async function watermarkImage(input: Buffer, originalName = "image"): Promise<WatermarkResult> {
  try {
    const base = sharp(input, { failOn: "none" });
    const meta = await base.metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;
    const hasAlpha = Boolean(meta.hasAlpha);

    let pipeline = sharp(input, { failOn: "none" });

    if (hasAlpha) {
      const bgPath = join(ASSETS_DIR, "art_bg.png");
      if (existsSync(bgPath)) {
        // Place the art on top of the branded background.
        const bg = await sharp(bgPath).resize(width, height, { fit: "cover" }).toBuffer();
        const art = await sharp(input, { failOn: "none" }).toBuffer();
        pipeline = sharp(bg).composite([{ input: art, gravity: "center" }]);
      } else {
        pipeline = pipeline.flatten({ background: { r: 17, g: 17, b: 20 } });
      }
    }

    const wm = watermarkSvg(width, height);
    const out = await pipeline.composite([{ input: wm, blend: "over" }]).png().toBuffer();

    const stem = originalName.replace(/\.[^.]+$/, "");
    return { buffer: out, filename: `${stem}-sc.png`, wasTransparent: hasAlpha };
  } catch (err) {
    log.error("[watermark] processing failed, sending original", err);
    return { buffer: input, filename: originalName, wasTransparent: false };
  }
}
