# Assets to provide (icons, logos, banner)

The site already works out of the box with **placeholder** icons, logos and a
banner, so nothing is broken while you gather your own. Replace any file below by
dropping a file **with the exact same name** in the exact folder — no code change
needed. You can send me as many as you want; there is no limit.

Everything lives under `crd-netlify/site/assets/`.

---

## 1) Icons  →  `site/assets/icons/`  (SVG)

**How they work:** each icon is tinted automatically to the current theme
(it turns light text-colour in dark mode, dark in light mode). So the icon's own
colour does **not** matter — only its shape. Give me clean, single-colour icons
(line/outline style is ideal, like Lucide / Feather).

- **Format:** `.svg`
- **Canvas:** design on a **24 × 24** grid, `viewBox="0 0 24 24"`
- **Style:** transparent background, one colour (stroke or fill), ~2px stroke
- **Naming:** lowercase, exact name from the list, e.g. `folder.svg`

### The 37 names the site uses
| name | used for |
|------|----------|
| `dashboard` | Dashboard nav |
| `briefcase` | Main Work |
| `user-clock` | Inactive |
| `scroll` | Before Revamp |
| `archive` | Archive / "move to archive" |
| `shield` | Admin |
| `folder` | cases |
| `user` | one staff member |
| `users` | staff (group) |
| `user-check` | authorized personnel |
| `search` | search box |
| `menu` | mobile menu button |
| `moon` | dark-theme toggle |
| `sun` | light-theme toggle |
| `logout` | logout |
| `key` | admin access list |
| `history` | audit / recent activity |
| `layers` | "categories" heading |
| `eye` | preview / "is logged" |
| `plus` | add staff / add case |
| `edit` | edit buttons |
| `trash` | delete / remove |
| `download` | download / export CSV |
| `upload` | upload dropzone |
| `check` | save / confirm |
| `x` | close modal |
| `info` | info hints |
| `alert` | confirm dialog |
| `lock` | classified badge |
| `paperclip` | proof / attachments |
| `pdf` | Export PDF button + PDF files |
| `word` | Export Word button |
| `file` | generic document |
| `image` | image files |
| `audio` | audio files |
| `video` | video files |
| `dot` | list bullet |

> Want more icons for future features? Send them and tell me where they should
> appear — I'll wire them up. Extra files in the folder are harmless.

---

## 2) Logos  →  `site/assets/`  (PNG, transparent)

Two versions because the app has dark **and** light mode. The login page is
**always dark**, so it uses the "on-dark" logo.

| file name | when it shows | make it… |
|-----------|---------------|----------|
| `logo-on-dark.png`  | login page + sidebar in **dark** mode | a **light / white** logo (reads on dark navy) |
| `logo-on-light.png` | sidebar in **light** mode | a **dark** logo (reads on white) |
| `logo.png` (already there) | browser tab favicon + fallback | your normal logo |

- **Format:** PNG with transparent background
- **Size:** square, **512 × 512** recommended (min 256 × 256). It's shown at
  ~34 px in the sidebar and ~78 px on login, so 512 keeps it crisp on retina.

*(Right now all three are seeded with your current `logo.png` so something shows.
Replace `logo-on-dark` / `logo-on-light` with proper light/dark variants when ready.)*

---

## 3) Banner  →  `site/assets/banner.png`  (PNG)

Used in the dashboard hero **and** at the top of every exported case (PDF + Word).

- **File name:** `banner.png`
- **Format:** PNG (JPG also fine if you rename it to `.png`… or tell me and I'll
  switch the reference)
- **Size:** wide, **1600 × 400** (a 4:1 ratio). Anything close works — it's
  scaled to fit. Keep important text/logo away from the far edges (the hero crops
  height a little on small screens).
- Right now there's a plain navy-gradient placeholder in that slot.

> If you have several banners (e.g. one for the dashboard, one for exports), send
> them and I'll split them into `banner.png` (dashboard) and `banner-export.png`
> (documents).

---

## TL;DR — where to drop things
```
site/
  logo.png                    (favicon / fallback — already present)
  assets/
    logo-on-dark.png          ← your WHITE logo   (512×512 png)
    logo-on-light.png         ← your DARK logo    (512×512 png)
    banner.png                ← your banner       (1600×400 png)
    icons/
      folder.svg  user.svg  search.svg ...   (24×24 svg, one colour, exact names)
```
Same names = zero code changes. Send them whenever; I'll slot them in.
