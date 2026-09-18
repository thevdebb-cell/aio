# Deploy Guide — Star Customs AIO

Three pieces:

1. **The bot** → runs on bot-hosting.net (or any Node 20+ host).
2. **Supabase** (recommended) → database + file storage for orders.
3. **Netlify site** (`site/`) → branded, secure download portal.

You can run the bot alone with the built-in JSON store and local download
server. Supabase + Netlify are recommended for production and for the download
site. Do the parts in this order.

---

## Part A — Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy the token (this is `DISCORD_TOKEN`).
3. In the **Bot** tab, enable **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
4. **OAuth2** tab → copy the **Client ID** (`CLIENT_ID`).
5. Invite the bot (replace `CLIENT_ID`), Administrator keeps anti-nuke simple:
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=8
   ```
6. In **Server Settings → Roles**, drag the bot's role **to the top**. Without
   this it can't manage roles/channels or quarantine members.

---

## Part B — Supabase (recommended)

1. Create a project at <https://supabase.com>.
2. **SQL Editor** → run:
   ```sql
   create table guilds       (guild_id text primary key, data jsonb not null);
   create table tickets      (channel_id text primary key, data jsonb not null);
   create table orders       (id text primary key, data jsonb not null);
   create table ratings      (id text primary key, data jsonb not null);
   create table prefix_logs  (id bigint generated always as identity primary key, data jsonb not null);
   create table mod_records  (id text primary key, data jsonb not null);
   ```
3. **Storage** → create a **private** bucket named `orders`.
4. **Project Settings → API** → copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (keep secret, server-side only)

---

## Part C — The bot on bot-hosting.net

1. Create a **Node.js** server on bot-hosting.net.
2. Upload **`aio-bot.zip`** and extract it into the server's files.
3. Create your config from the examples:
   - Copy `src/config/config.example.json` → `src/config/config.json`, then fill:
     - `owners`: your Discord ID (enable Developer Mode → right-click yourself →
       Copy ID). Add co-owners too.
     - `whitelist`: trusted staff IDs.
     - `emojis`: paste your custom emojis (`<:name:id>`); channel-name emojis
       (`orderUnclaimed`, `orderClaimed`) must be **Unicode** like `⛔` / `🟢`.
     - `banners`: keep the filenames; upload the images into `assets/`.
     - `autoRoles` / `verifiedRoleId`: optional.
4. Set **environment variables** (bot-hosting "Startup"/"Variables", or a `.env`
   file — see the reference table below). At minimum:
   `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
   For Supabase: `STORE_DRIVER=supabase`, `FILE_DRIVER=supabase`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET=orders`.
   For the site: `SITE_BASE_URL`, and a strong `DOWNLOAD_SECRET`.
5. Upload your banner images into the `assets/` folder (see `assets/README.md`).
6. Set the **startup command** to:
   ```
   npm install && npm run host
   ```
   (`host` deploys the slash commands, then starts the bot with `tsx`. If your
   panel prefers a single file, use `npm install && npm run build && npm start`.)
7. Start the server. You should see `Logged in as …` in the console.

> **Not using Supabase?** Leave `STORE_DRIVER=json` and `FILE_DRIVER=local`. Then
> set `DOWNLOAD_PORT` to a port bot-hosting exposes and `DOWNLOAD_PUBLIC_URL` to
> the public URL that reaches it, plus a stable `DOWNLOAD_SECRET`. The download
> site (Part D) requires Supabase.

---

## Part D — Netlify download site

1. On <https://app.netlify.com> → **Add new site** → deploy **`aio-site.zip`**
   (drag-and-drop the extracted `site/` folder, or connect the repo with base
   directory `site`).
2. **Site settings → Environment variables**:
   | Key | Value |
   | --- | --- |
   | `DOWNLOAD_SECRET` | the **same** value as the bot's `DOWNLOAD_SECRET` |
   | `SUPABASE_URL` | your Supabase URL |
   | `SUPABASE_SERVICE_KEY` | Supabase service role key |
   | `SUPABASE_BUCKET` | `orders` |
3. Redeploy, then set the bot's `SITE_BASE_URL` to the Netlify URL
   (e.g. `https://star-customs-orders.netlify.app`) and restart the bot.

---

## Part E — First run in Discord

As an owner:
1. `!setup` — creates roles (High Rank, Support, Quality Control, Quarantine,
   per-service Designers) and channels (Tickets, Orders, logs, order-logs,
   quality-control, disputes, reviews, transcripts, quarantine).
2. Assign staff roles to your team (and to yourself for testing).
3. In your assistance channel: `!sendsupportpanel`.
   In your order channel: `!sendorderpanel`.
4. Test: open a support ticket, open an order, claim, `/sendimage`, `/submit`,
   approve in quality-control, receive the DM, confirm, review.

---

## Environment variable reference

| Variable | Required | Notes |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID (for slash deploy) |
| `GUILD_ID` | yes | Your server ID (instant slash deploy) |
| `STORE_DRIVER` | no | `json` (default) or `supabase` |
| `FILE_DRIVER` | no | `local` (default) or `supabase` |
| `SUPABASE_URL` | if supabase | Project URL |
| `SUPABASE_SERVICE_KEY` | if supabase | Service role key |
| `SUPABASE_BUCKET` | no | Default `orders` |
| `DOWNLOAD_LINK_TTL_MINUTES` | no | Default `10` |
| `DOWNLOAD_PORT` | local files | Port for the built-in download server |
| `DOWNLOAD_PUBLIC_URL` | local files | Public base URL reaching that port |
| `DOWNLOAD_SECRET` | recommended | HMAC secret; must match Netlify |
| `SITE_BASE_URL` | for site | Netlify site URL |
| `BLOXLINK_API_KEY` | for `/verify` | Bloxlink API key |

---

## Troubleshooting

- **Slash commands don't appear** → run `npm run deploy` (or restart with the
  `host` script) and confirm `CLIENT_ID` + `GUILD_ID`.
- **Bot can't create channels / quarantine** → its role isn't at the top, or it
  lacks Administrator.
- **Anti-nuke does nothing** → it needs **View Audit Log**; Administrator covers it.
- **Banners don't show** → filenames in `config.json` must match files in
  `assets/`. Missing files are skipped (no crash).
- **Download link says expired immediately** → the bot and Netlify have different
  `DOWNLOAD_SECRET`, or the server clocks differ. Make them identical.
- **Channel names miss the emoji** → use Unicode (`⛔`/`🟢`), not custom emojis.
