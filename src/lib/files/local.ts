import { createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdirSync, existsSync, writeFileSync, readFileSync, createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logger.js";
import type { FileStore, StoredFileMeta } from "./types.js";

/**
 * Local file store: writes to data/files/<key> and serves downloads from a
 * built-in HTTP server. Links are HMAC-signed and expire, mirroring the
 * Supabase signed-URL behaviour so the flow is identical in dev.
 *
 * env:
 *   DOWNLOAD_PORT         (default 8787)
 *   DOWNLOAD_PUBLIC_URL   public base, e.g. https://yourbot.bothosting.net (default http://localhost:PORT)
 *   DOWNLOAD_SECRET       stable HMAC secret (recommended; random per-run otherwise)
 */
export class LocalFileStore implements FileStore {
  private dir = join(process.cwd(), "data", "files");
  private metaPath = join(this.dir, "_meta.json");
  private meta: Record<string, StoredFileMeta> = {};
  private secret = process.env.DOWNLOAD_SECRET ?? randomBytes(24).toString("hex");
  private port = Number(process.env.DOWNLOAD_PORT ?? 8787);
  private publicUrl = process.env.DOWNLOAD_PUBLIC_URL ?? `http://localhost:${Number(process.env.DOWNLOAD_PORT ?? 8787)}`;
  private server: Server | null = null;

  async init(): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    if (existsSync(this.metaPath)) {
      try {
        this.meta = JSON.parse(readFileSync(this.metaPath, "utf8"));
      } catch {
        this.meta = {};
      }
    }
    if (!process.env.DOWNLOAD_SECRET) {
      log.warn("[files] DOWNLOAD_SECRET not set — download links won't survive a restart. Set it for production.");
    }
    this.startServer();
    log.info(`[files] local file store ready (serving on ${this.publicUrl})`);
  }

  private diskPath(key: string): string {
    return join(this.dir, key.replace(/\.\./g, ""));
  }

  async upload(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void> {
    const path = this.diskPath(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
    this.meta[key] = meta;
    writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2));
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Date.now() + ttlSeconds * 1000;
    const payload = Buffer.from(JSON.stringify({ key, exp })).toString("base64url");
    const sig = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${this.publicUrl}/d/${payload}.${sig}`;
  }

  private verify(token: string): { key: string; exp: number } | null {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = createHmac("sha256", this.secret).update(payload).digest("base64url");
    if (sig !== expected) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { key: string; exp: number };
      if (Date.now() > data.exp) return null;
      return data;
    } catch {
      return null;
    }
  }

  private startServer(): void {
    if (this.server) return;
    this.server = createServer((req, res) => {
      const url = req.url ?? "";
      const m = url.match(/^\/d\/(.+)$/);
      if (!m) {
        res.writeHead(404).end("Not found");
        return;
      }
      const data = this.verify(decodeURIComponent(m[1]!));
      if (!data) {
        res.writeHead(410).end("This link has expired.");
        return;
      }
      const path = this.diskPath(data.key);
      if (!existsSync(path)) {
        res.writeHead(404).end("File not found");
        return;
      }
      const meta = this.meta[data.key];
      res.writeHead(200, {
        "Content-Type": meta?.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${meta?.filename ?? "download"}"`,
      });
      createReadStream(path).pipe(res);
    });
    this.server.listen(this.port, () => log.info(`[files] download server listening on :${this.port}`));
    this.server.on("error", (err) => log.error("[files] download server error", err));
  }
}
