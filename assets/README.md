# assets/

Put the banner image files here (PNG or JPG). The bot attaches them to the
Components V2 panels. Missing files are skipped gracefully (the panel just
renders without the banner), so you can add them anytime.

Expected filenames (must match `banners` in `src/config/config.json`):

| File                    | Where it shows                                  |
| ----------------------- | ----------------------------------------------- |
| `assistance_top.png`    | top of the assistance / support panel           |
| `assistance_bottom.png` | bottom of the assistance / support panel        |
| `order_top.png`         | top of the order / services panel               |
| `order_bottom.png`      | bottom of the order / services panel            |
| `welcome_dm.png`        | banner in the welcome DM sent when someone joins |
| `ticket_claimed_dm.png` | banner in the "your ticket was claimed" DM      |
| `order_created_dm.png`  | banner in the "order created" DM                |
| `order_ready_dm.png`    | banner in the "order ready" DM (phase 2)        |
| `rating_dm.png`         | banner in the rating DM (phase 2)               |

On bot-hosting.net: upload these into a folder named `assets` next to the
bot files. Keep the exact filenames above.
