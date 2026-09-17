# CRD — Deploy guide

CRD (Central Record Directory) is a static site + Netlify Functions + Supabase.
The Supabase **service key never reaches the browser** — it lives only in the
functions' environment variables. No record is ever embedded in the HTML; the app
fetches everything through the functions, which verify the session token first. So
"inspect element" on the login page reveals nothing.

## 1. Supabase

1. Open your Supabase project → **SQL editor** → paste `sql/crd-schema.sql` → Run.
   This creates the tables (`crd_sessions`, `crd_access`, `crd_staff`, `crd_cases`,
   `crd_counters`, `crd_audit`) and a **private** storage bucket `crd-files` for
   proof + documents.
2. Nothing else — the functions use the **service role** key, which bypasses RLS,
   so you don't need storage policies. Keep that key secret.

## 2. Netlify

1. New site from this folder (`crd-netlify/`). Netlify reads `netlify.toml`:
   - publish dir: `site`
   - functions dir: `netlify/functions`
2. Set the two environment variables (Site settings → Environment variables):
   - `SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co`
   - `SUPABASE_SERVICE_KEY` = your Supabase **service_role** key
3. Deploy. (Netlify installs `@supabase/supabase-js` from `package.json`.)
4. Point your domain (`crd.nyuc.app`) at the site if you want.

## 3. Bot

`/crdauth` and `/crdmanage` live in the Discord bot — see `../bot/BOT-CHANGES.md`.
The bot and the site share the same Supabase project (same `crd_*` tables), so
`/crdmanage grant` on Discord immediately lets that person log in on the website.

## Login flow (unchanged, "as usual")

1. User opens the site → gets a 6-char **code** (page stays on the dark login).
2. User runs `/crdauth <code>` in Discord.
3. Bot checks: is this person whitelisted **or** granted via `/crdmanage`?
   - yes → session becomes active (`is_whitelist` decides read-only vs full).
   - no → session marked `denied`, site shows "NO AUTHORIZATION".
4. Site polls, sees `ok`, and enters the app. "Stay connected" remembers the
   token in that browser only.

## Roles

- **Whitelist** (from the bot's `config.json`): full read/write, Admin tab,
  upload/delete files, export.
- **Reader** (granted via `/crdmanage`): can view everything and **download**
  proof/documents, but cannot add, edit, delete or upload.

## Assets (icons / logos / banner)

See `ASSETS-YOU-PROVIDE.md`. The site ships with working placeholders; drop your
own files with the same names to replace them, no redeploy of code logic needed.
