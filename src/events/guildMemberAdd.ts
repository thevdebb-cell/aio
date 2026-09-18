import { Events, type GuildMember } from "discord.js";
import { defineEvent } from "../lib/framework.js";
import { onMemberJoin } from "../modules/welcome/index.js";
import { onMemberAdd as antinukeMemberAdd } from "../modules/antinuke/index.js";
import { applyAutoRoles } from "../modules/autorole/index.js";

export default defineEvent({
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    // Anti-nuke first (kick unauthorized bots before welcoming them).
    await antinukeMemberAdd(member);
    if (member.user.bot) return;
    await applyAutoRoles(member);
    await onMemberJoin(member);
  },
});
