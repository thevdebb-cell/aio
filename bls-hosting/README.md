# BLS.Hosting

Internal bot hosting panel for blociapps. Upload a zip, pick a runtime, set the
environment, press start — the same shape as the public bot hosting panels, with
no quotas and no billing, running on your own VPS.

Everything lives on the box: the SQLite database, the deployment folders, the
logs, the runtimes. Nothing calls out except runtime downloads and certificate
issuance.

---

## What is in the box

**The portal** at `/` — four tiles with your icons. Only *BLS Hosting* opens.
The other three print `BLS VPN Required` in red.

**The access page** at `/access` — one access code field and the contact table
(Net, Folded, Eyes). Deliberately plain.

**The panel** at `/panel` — dark and light, a sidebar of deployments, and per
deployment:

| Tab | What it does |
|---|---|
| Console | live output over a websocket, stdin box, start / stop / restart / kill / install deps |
| Files | drag a zip in and it unpacks itself, browse, edit code in place, rename, delete, download, set the startup file |
| Environment | key and value rows, secrets hidden by default, written to the process env and to a `.env` |
| Settings | runtime, RAM, port, startup file, extra args, install command, autostart, auto restart, per deployment access codes, delete |

**Overview** shows host RAM, the allocated pool, CPU, disk and every deployment
at a glance. **Runtimes** installs Node 24 / 22 / 20 / 18 and Python 3.13 / 3.12
/ 3.11 on demand. **Activity** is the audit log of every write action.

### Roles

| | admin | viewer |
|---|---|---|
| See the console and the code | yes | yes |
| Start stop restart kill | yes | no |
| Edit files, env, settings | yes | no |
| Download the code | yes | no |
| Reveal secret values | yes | no |
| Create or delete deployments | yes (global code only) | no |

Two global codes ship with the panel (admin and viewer). From a deployment's
Settings tab you can generate extra codes scoped to **that deployment only** —
handy when someone needs to watch one bot and nothing else.

---

## Install on the VPS

1. Copy this folder onto the server, for example `C:\install\bls-hosting`.
2. Right click **`setup.bat`** and pick **Run as administrator**.
3. Answer three questions (domain, email for certificates, install folder).
4. Wait. The installer then prints the one DNS record you still have to create.

The installer does the rest:

- creates `C:\bls\{panel,data,deployments,runtimes,logs,backups,tools,tmp}`
- downloads a **private Node runtime** into `C:\bls\runtimes` — nothing is
  installed system wide and no PATH is touched
- installs the panel dependencies
- writes `C:\bls\panel\.env` with a fresh 64 character session secret and locks
  it to Administrators and SYSTEM
- pulls Node 22 as a second runtime for your bots
- registers **`bls-panel`** and **`bls-caddy`** as Windows services through NSSM,
  with log rotation at 10 MB, crash restart and a restart throttle
- writes a Caddyfile that terminates TLS and reverse proxies to `127.0.0.1:3300`,
  websockets included
- opens 80 and 443 in Windows Defender Firewall — and nothing else
- enables long paths so deep `node_modules` trees stop breaking installs

### The DNS record

`blociapps.com` is registered at **IONOS**, so the DNS zone lives there — not at
OVH, which only hosts the VPS. In the IONOS control panel under **Domains & SSL →
blociapps.com → DNS**:

| Type | Name | Value |
|---|---|---|
| A | `bls` | your VPS IPv4 |
| CAA | `@` | `0 issue "letsencrypt.org"` |

The CAA record is not required but it is worth the thirty seconds: it tells every
certificate authority on earth that only Let's Encrypt may issue certificates for
this domain, which shuts the door on a whole class of abuse.

Caddy asks Let's Encrypt for the certificate on the first visit, so give it a
minute after the record resolves. If the OVH **network** firewall is enabled in
the OVH control panel, remember it is a second layer in front of the VPS — port
80 and 443 must be open there too, or validation times out.

### If a Caddy already runs on this host

One machine runs one Caddy. A second instance cannot share ports 80, 443 and the
admin port 2019, so it sits in a failed state while the first keeps serving. The
installer detects this and declines to start a second one.

Join the existing instance instead:

```powershell
.\scripts\attach-to-caddy.ps1 `
    -Caddyfile C:\nyuc\tools\caddy\Caddyfile `
    -Service   nyuc-caddy `
    -Domain    bls.blociapps.com `
    -Port      3300 `
    -RemoveBlsCaddy
```

It backs the Caddyfile up, appends the site block only (a second global options
block would be a syntax error), formats and validates, and **restores the backup
if validation fails**. On success it reloads with `caddy reload`, so the sites
already being served never drop a request.

### Your icons

Drop five png files in `C:\bls\panel\public\img`:

```
bls-logo.png  intranex.png  bls-hosting.png  myorder.png  myspace.png
```

Square, transparent background, 128 or 256 pixels. A missing file is not an
error — the tile falls back to the first letter of its name.

---

## Day to day

```powershell
Get-Service bls-*                                    # are the services up
Restart-Service bls-panel                            # restart the panel
Get-Content C:\bls\logs\panel\err.log -Tail 50 -Wait # follow the panel log
cd C:\bls\panel
..\runtimes\node-v24*-win-x64\node.exe scripts\check.js   # full status report
```

Shipping a new version of the panel itself:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update.ps1
```

It stops the service, mirrors the new source (your `.env`, deployments, data and
logs are excluded), reinstalls dependencies and starts back up.

Rotating a global code:

```powershell
cd C:\bls\panel
..\runtimes\node-v24*-win-x64\node.exe scripts\set-code.js admin "NewCode!2026"
```

Old sessions holding that code are dropped immediately.

---

## Deploying a bot

1. **New deployment** — name it, pick the runtime, drag the RAM slider across
   what is free, let it pick the next free port (or say the bot does not listen).
2. **Files** — drop the zip. A single wrapping folder inside the archive is
   flattened automatically, and the startup file is guessed (`index.js`,
   `bot.js`, `main.py`, `package.json` main, and so on).
3. **Environment** — add `DISCORD_TOKEN` and friends. They reach the process and
   are written to a `.env` beside your code.
4. **Install deps** — runs `npm ci` or `npm install` when there is a
   `package.json`, `pip install -r requirements.txt` when there is a
   `requirements.txt`. Output streams into the console.
5. **Start.**

The panel passes `PORT` and `BLS_RAM_MB` into the environment. For Node it also
sets `--max-old-space-size` to 85 percent of the allocation.

---

## How the limits actually work

RAM is **advisory, not enforced by the kernel**. Windows has no cgroups, so the
panel does two things instead:

- Node processes get `--max-old-space-size` matched to the allocation.
- A watchdog samples the resident memory of every running deployment every five
  seconds. Three samples above 105 percent of the allocation in a row and the
  process is killed with a line in the console saying why.

Overcommit is allowed on purpose (`BLS_ALLOW_OVERCOMMIT=true`): this is your
box, so the panel warns instead of blocking. The Overview banner tells you when
the pool is oversubscribed.

Ports are handed out from 3400 to 3499 and bound to `127.0.0.1`. Nothing reaches
a deployment except through Caddy.

---

## Security notes

- Access codes are hashed with scrypt and a per code salt. A keyed lookup index
  means a login costs one scrypt pass, not one per stored code.
- Sessions are random 32 byte tokens, stored hashed, in an httpOnly SameSite
  cookie. `Secure` is added automatically when the public URL is https.
- Eight wrong codes from one IP inside fifteen minutes locks that IP out, on top
  of a request rate limiter.
- Every state changing request carries a CSRF token, and cross origin writes are
  rejected.
- Strict CSP with no inline script and no inline style, plus nosniff, DENY
  framing, no referrer and HSTS.
- Upload paths are checked twice, symlinks resolved. Archive entries that point
  outside the deployment folder (`..`, absolute paths, drive letters) are counted
  and skipped.
- The `.env` of a deployment cannot be opened in the file editor — secrets only
  move through the Environment tab, which logs every reveal.
- Every write action lands in the audit log with actor, target and IP.

The panel binds `127.0.0.1` and must stay that way. It is the reverse proxy that
faces the internet.

---

## Configuration

`C:\bls\panel\.env` — restart `bls-panel` after a change.

| Key | Default | Meaning |
|---|---|---|
| `BLS_HOST` | `127.0.0.1` | bind address — leave it alone |
| `BLS_PORT` | `3300` | panel port behind the proxy |
| `BLS_PUBLIC_URL` | — | drives secure cookies and the printed links |
| `BLS_ROOT` | `C:\bls` | where everything lives |
| `BLS_SECRET` | generated | session and lookup key |
| `BLS_SESSION_MINUTES` | `720` | sliding session lifetime |
| `BLS_PORT_MIN` / `BLS_PORT_MAX` | `3400` / `3499` | deployment port range |
| `BLS_RAM_RESERVE_MB` | `1536` | held back for Windows and the panel |
| `BLS_ALLOW_OVERCOMMIT` | `true` | allocate past the pool with a warning |
| `BLS_MAX_UPLOAD_MB` | `256` | archive size cap |
| `BLS_SEED_ADMIN_CODE` / `BLS_SEED_VIEWER_CODE` | — | read once, on the very first start |

---

## Backups

What matters is `C:\bls\data` (the database) and `C:\bls\deployments` (the code
and the `.env` files). A nightly task that zips both off the box is the real
safety net — the OVH automated backup keeps 24 hours only, which does not help
when a problem is noticed two days later.

```powershell
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
Compress-Archive -Path C:\bls\data\*, C:\bls\deployments\* `
                 -DestinationPath "C:\bls\backups\bls_$stamp.zip" -Force
Get-ChildItem C:\bls\backups -Filter "bls_*.zip" |
    Sort-Object CreationTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
```

---

## When something is wrong

| Symptom | Where to look |
|---|---|
| The site does not load | `Get-Service bls-*`, then `C:\bls\logs\caddy\err.log` |
| The panel is down but Caddy is up | `C:\bls\logs\panel\err.log` |
| Certificate never issued | DNS not pointing here yet, or port 80 closed in the OVH network firewall |
| A bot will not start | its console — the startup file, the runtime and the exit code are all printed there |
| A bot keeps restarting | five crashes inside five minutes pauses auto restart and says so in the console |
| Everything looks odd | `node scripts\check.js` prints config, runtimes, codes and deployments |

---

## Running it locally

```bash
cp .env.example .env    # then edit BLS_ROOT and BLS_PUBLIC_URL
npm install
npm start               # http://127.0.0.1:3300
node scripts/smoke.js   # end to end test against the running panel
```

Node 22.5 or newer. The database is the built in `node:sqlite`, so there is no
native module to compile — which is exactly why installs on Windows do not need
build tools.
