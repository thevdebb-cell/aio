# aio — NYUC all-in-one

Internal tooling for the NY:RP server (NYUC). Two things live here:

## `crd-netlify/` — CRD (Central Record Directory)
The Higher Inspection internal record site: all-time staff and cases, split into
**Main Work / Inactive / Before Revamp / Archive**, with per-case **proof**
(any file format — audio, video, images, PDF, zip…) and **authorization
documents**, global search, a dashboard, dark/light themes, and **PDF + Word**
export with a styled banner. Static site + Netlify Functions + Supabase.

- Deploy: `crd-netlify/DEPLOY.md`
- Icons / logos / banner to provide: `crd-netlify/ASSETS-YOU-PROVIDE.md`
- Data model + storage: `crd-netlify/sql/crd-schema.sql`

Access is gated by the Discord bot: `/crdauth` to log in, `/crdmanage` to grant
access. Nothing sensitive is ever in the page source — records come from the
functions after a server-side token check.

## `case-public/` — public site (case.nyuc.app)
A tiny Express app for the VPS that shows only **declassified** cases
(`confidentiality = public`) with their downloadable documents. Nothing sensitive
reaches the browser; the Supabase service key stays in the server `.env`. Deploy
guide (DNS + Caddy + NSSM, OVH/Windows): `case-public/DEPLOY-VPS.md`.

## Real-time auto-sync
`crd-netlify/sql/crd-autosync.sql` installs Postgres triggers so that a case or
staff profile created/updated on MilWeb **or** by the bot is mirrored into CRD
automatically (no manual "Sync now"). Synced cases default to `internal` and only
appear on the public site once declassified in CRD.

## `bot/` — Discord bot changes
The `/crdmanage` command (grant / revoke / list CRD access) added to the existing
NYUC bot. Only `index.js` + `deploy-commands.js` changed. See `bot/BOT-CHANGES.md`.

> **Secrets:** `bot/config.json` (bot token, Supabase service key) is git-ignored.
> Use `bot/config.example.json` as a template and rotate anything that leaked.
