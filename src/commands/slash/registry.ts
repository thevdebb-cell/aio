import type { SlashCommand } from "../../lib/framework.js";
import { say } from "./say.js";
import { ticket } from "./ticket.js";
import { closerequest } from "./closerequest.js";
import { orderinfo } from "./orderinfo.js";
import { sendimage } from "./sendimage.js";
import { submit } from "./submit.js";
import { order } from "./order.js";
import { dispute } from "./dispute.js";
import { afk } from "./afk.js";
import { verify } from "./verify.js";
import { moderationCommands } from "./moderation.js";
import { staffCommands } from "./staff.js";

export const slashCommands: SlashCommand[] = [
  say,
  ticket,
  closerequest,
  orderinfo,
  sendimage,
  submit,
  order,
  dispute,
  afk,
  verify,
  ...moderationCommands,
  ...staffCommands,
];
