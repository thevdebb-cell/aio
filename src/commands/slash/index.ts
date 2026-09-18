import type { SlashCommand } from "../../lib/framework.js";
import { say } from "./say.js";
import { ticket } from "./ticket.js";
import { closerequest } from "./closerequest.js";
import { orderinfo } from "./orderinfo.js";
import { sendimage } from "./sendimage.js";

export const slashCommands: SlashCommand[] = [say, ticket, closerequest, orderinfo, sendimage];
