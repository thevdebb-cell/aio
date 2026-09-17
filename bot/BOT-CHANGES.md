# Bot changes for CRD

Only **two** files changed from your existing bot. Everything else
(`storage.js`, `telex-print.js`, `printlog.js`, `builder.js`, `linkedroles.js`,
`config.json`, `data.json`, `INFRACTIONS.png`, ...) stays exactly as it is in
your current deployment.

## What was added

### `/crdmanage`  (whitelist only)
A single command to manage who can log in to the CRD website:

| Subcommand | What it does |
|------------|--------------|
| `/crdmanage grant  user:@x`  | Gives `@x` access to CRD, DMs them, records their username. |
| `/crdmanage revoke user:@x`  | Removes access and kills any active CRD session for `@x`. |
| `/crdmanage list`            | Lists everyone individually granted access. |

Whitelisted members (from `config.json` → `whitelist`) **always** have access and
don't need a grant. `/crdauth <code>` (unchanged) is still how anyone logs in.

> The older `/crdaccess grant|revoke` still works too — `/crdmanage` is the
> superset you asked for (it adds `list` and stores the username).

## How to deploy the change

1. Copy the two updated files into your bot folder, replacing the old ones:
   - `index.js`
   - `deploy-commands.js`
2. Re-register the slash commands **once** (so `/crdmanage` shows up):
   - On bot-hosting.cloud: set the Main File to `deploy-commands.js`, start it,
     wait for "commands registered", then set the Main File back to `index.js`.
   - Locally: `node deploy-commands.js`
3. Restart the bot (`index.js`).

## Reminder about secrets
Your `config.json` holds the bot token and the Supabase **service key**. Keep it
out of git. This repo ships `config.example.json` (placeholders only). The token
and keys that were in the file you sent me should be treated as compromised and
rotated — a Supabase service key can read/write your whole database.
