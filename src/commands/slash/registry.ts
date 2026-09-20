import type { SlashCommand } from "../../lib/framework.js";
import { say } from "./say.js";
import { ticket } from "./ticket.js";
import { closerequest } from "./closerequest.js";
import { orderinfo } from "./orderinfo.js";
import { delivered } from "./delivered.js";
import { sendgp } from "./sendgp.js";
import { lockreview } from "./lockreview.js";
import { afk } from "./afk.js";
import { verify } from "./verify.js";
import { moderationCommands } from "./moderation.js";
import { staffCommands } from "./staff.js";

export const slashCommands: SlashCommand[] = [
  say,
  ticket,
  closerequest,
  orderinfo,
  delivered,
  sendgp,
  lockreview,
  afk,
  verify,
  ...moderationCommands,
  ...staffCommands,
];
