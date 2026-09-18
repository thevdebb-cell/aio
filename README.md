# AIO — Star Customs

All-in-one Discord bot for **Star Customs**: support tickets, orders, quality
control, anti-nuke/raid, moderation, welcome, and more.

**House style (enforced everywhere):**
- All panels/embeds use **Components V2**, accent colour **black**.
- **No footers**, ever.
- **No emoji** unless *you* add it. Every emoji comes from `config.emojis`
  (left empty until you upload your own). The bot never invents one.

---

## What works right now (phase 1)

- **Core**: TypeScript + discord.js v14.27, dynamic slash/prefix/event
  registries, black Components V2 UI, JSON store (Supabase-ready).
- **Support**: assistance panel (dropdown, 5 categories), per-category modals,
  ticket creation with locked permissions, claim / unclaim / close / cancel,
  DM to the opener on claim, transcripts on close.
- **Orders**: services panel with live wifi statuses, order creation with a
  unique traceable order ID (`SC-XXXXXXXX-XXXX`), unclaimed/claimed channel
  naming with queue, order-logs channel, order-created DM.
- **Tickets slash**: `/ticket add`, `/ticket escalated`, `/closerequest`,
  `/orderinfo`.
- **Anti-nuke**: bot-add protection (owners only), channel create/delete/edit
  revert by non-whitelisted users, 3-strike system → quarantine (role strip +
  7-day timeout).
- **Welcome**: channel message + DM with banner, link buttons (Dashboard /
  Assistance / Order) and a non-clickable member-count button.
- **Owner/WL**: `!setup`, `!sendsupportpanel`, `!sendorderpanel`,
  `!supporton` / `!supportoff`, `!prefixlogs`, `!service`, `/say`.

## Coming next (phase 2+)

Order delivery pipeline (`/sendimage` with watermark, `/submit`, quality
control approval, download links, ratings & disputes), infractions/promotions,
AFK, Bloxlink verification, auto-role, full moderation commands. See
[ROADMAP](#roadmap).

---

## Setup

```bash
npm install
cp .env.example .env                       # fill DISCORD_TOKEN, CLIENT_ID, GUILD_ID
cp src/config/config.example.json src/config/config.json   # fill owners, whitelist, emojis…
npm run deploy                             # register slash commands
npm run dev                                # run in watch mode (or: npm run build && npm start)
```

Then in Discord (as an owner):

```
!setup                 # creates roles, categories, staff channels, quarantine
!sendsupportpanel      # run inside your assistance channel
!sendorderpanel        # run inside your order channel
```

`config.json` holds owners, whitelist, links, emojis, banners and services.
Role/channel IDs created by `!setup` are stored by the bot automatically.

---

## Commands

Prefix: `!` — slash: `/`

### General
| Command | Access | Description |
| --- | --- | --- |
| `!ping` | everyone | Bot latency |
| `!commands` (`!help`) | everyone | This list |
| `!serverinfo` | everyone | Server info |
| `!userinfo [user]` | everyone | User info |
| `!avatar [user]` | everyone | User avatar |

### Whitelist
| Command | Description |
| --- | --- |
| `!service <service> <on\|delay\|closed\|unavail>` | Set a service status |
| `/say <message> [channel]` | Send a message as the bot |

`!service` statuses: `on` → Online (green), `delay` → Delayed (yellow),
`closed` → Offline (red), `unavail` → Unavailable (grey, not orderable).

### Owner
| Command | Description |
| --- | --- |
| `!setup` | Create all roles & channels |
| `!sendsupportpanel` | Post the assistance panel here |
| `!sendorderpanel` | Post the order panel here |
| `!supporton` / `!supportoff` | Toggle support ticket creation |
| `!prefixlogs` | Recent `!` commands run by staff |

### Tickets (slash)
| Command | Access | Description |
| --- | --- | --- |
| `/ticket add <user>` | ticket staff | Add a user to the current ticket |
| `/ticket escalated <section>` | ticket staff | Escalate the ticket to another section |
| `/closerequest` | ticket staff | Ask the opener to approve closing |
| `/orderinfo <id>` | staff | Look up an order by ID |

---

## ▶ What I need from you (upload these)

### 1. Custom emojis
Upload these as **server emojis**, then paste each one (in the format
`<:name:id>` or `<a:name:id>` for animated) into `config.emojis` in
`src/config/config.json`.

| config key | suggested emoji name | used for |
| --- | --- | --- |
| `wifiOnline` | `wifi_green` | service Online |
| `wifiDelayed` | `wifi_yellow` | service Delayed |
| `wifiOffline` | `wifi_red` | service Offline |
| `wifiDev` | `wifi_grey` | service Unavailable / in dev |
| `star` | `star` | ratings |
| `notification` | `notification` | ticket-claimed DM |
| `memberCount` | `members` | welcome member-count button |

> The four **wifi icons** you mentioned = these `wifi_*` emojis. Upload the
> green / yellow / red / grey wifi images as emojis with those names.

### 2. Channel-name emojis (IMPORTANT — must be Unicode)
Discord **cannot** show custom server emojis in channel names, only standard
Unicode ones. So for the order ticket names use Unicode emojis:

| config key | suggested | used for |
| --- | --- | --- |
| `orderUnclaimed` | `⛔` | unclaimed order ticket name |
| `orderClaimed` | `🟢` | claimed order ticket name |

Result: `⛔ • graphic-username` → after claim → `🟢 • graphic-designer-3`.
Paste the literal emoji character into `config.json`.

### 3. Banners (PNG/JPG)
Put these in the `assets/` folder (see `assets/README.md`). On bot-hosting.net,
upload them into an `assets` folder next to the bot files, same filenames:

`assistance_top.png`, `assistance_bottom.png`, `order_top.png`,
`order_bottom.png`, `welcome_dm.png`, `ticket_claimed_dm.png`,
`order_created_dm.png` (+ phase 2: `order_ready_dm.png`, `rating_dm.png`).

---

## Storage — recommendation

Default driver is **JSON** (`data/` folder, zero setup) — great to start.

For production I recommend **Supabase** (`STORE_DRIVER=supabase`), because:
- Your **download website** needs to read order data too. Supabase (hosted
  Postgres) is reachable from both the bot and the site; a local JSON/SQLite
  file is not.
- **Supabase Storage signed URLs** expire after a set time — set it to 600s and
  that *is* your "link valid for 10 minutes" feature, for free. "Regen link"
  just creates a fresh signed URL.

Install + config:
```bash
npm i @supabase/supabase-js
# .env: STORE_DRIVER=supabase, SUPABASE_URL=..., SUPABASE_SERVICE_KEY=..., SUPABASE_BUCKET=orders
```

Supabase schema (SQL):
```sql
create table guilds       (guild_id text primary key, data jsonb not null);
create table tickets      (channel_id text primary key, data jsonb not null);
create table orders       (id text primary key, data jsonb not null);
create table ratings      (id text primary key, data jsonb not null);
create table prefix_logs  (id bigint generated always as identity primary key, data jsonb not null);
-- storage bucket "orders" (private) for submitted files; use createSignedUrl(path, 600) for downloads.
```

---

## Roadmap

- [ ] `/sendimage` (designers only, in-ticket) with anti-theft watermark on
      transparent PNGs (needs `sharp` + `watermark.png`).
- [ ] `/submit` (file / zip / link / id), quality-control channel approval,
      "order ready" DM with Jump-to-DMs + Help buttons.
- [ ] Download links via Supabase signed URLs (10-min expiry) + regen button.
- [ ] Ratings (public/anonymous) + `!rateslogs`, order confirmation flow,
      disputes (12h lock, transcript to dispute channel, verdict + sanctions).
- [ ] `/promotion issue`, `/infraction issue` (staff + designer).
- [ ] Moderation suite + AFK.
- [ ] Bloxlink verification + auto-role.

---

## Project layout

```
src/
  index.ts              bootstrap
  deploy-commands.ts    slash command registration
  config/               config loader + config.json
  types/                shared domain types
  lib/                  client, logger, UI (Components V2), interactions, store
  commands/
    prefix/             ! commands (general + admin)
    slash/              / commands
  modules/
    tickets/            shared ticket engine (create, claim, transcript)
    support/            assistance panel + support flow
    orders/             services panel + order flow + statuses
    welcome/            join welcome (channel + DM)
    antinuke/           anti-nuke / raid protection
assets/                 banner images
```
