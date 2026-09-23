import type { GuildMember } from "discord.js";
import type { PrefixCommand } from "../../lib/framework.js";
import { container, text, separator, V2FLAG } from "../../lib/ui.js";
import { out } from "../../lib/msg.js";

const ping: PrefixCommand = {
  name: "ping",
  description: "Check the bot's latency",
  execute: async (message) => {
    const sent = await out(message).send({ content: "Pinging…" });
    const rtt = sent.createdTimestamp - message.createdTimestamp;
    await sent.edit({ content: `Ping. Latency ${rtt}ms · API ${Math.round(message.client.ws.ping)}ms` });
  },
};

const commands: PrefixCommand = {
  name: "commands",
  aliases: ["help"],
  description: "List all available commands",
  execute: async (message) => {
    const c = container().addTextDisplayComponents(
      text("## Commands"),
      text(
        [
          "**General**",
          "`!ping` - check latency",
          "`!commands` - this list",
          "`!serverinfo` - info about this server",
          "`!userinfo [user]` - info about a user",
          "`!avatar [user]` - a user's avatar",
          "",
          "**Whitelist**",
          "`!service <service> <on|starplus|closed|delayed>` - set a service status",
          "`/say <message> [channel]` - speak as the bot",
          "",
          "**Owner**",
          "`!setup` - create roles & channels",
          "`!sendsupportpanel` - post the assistance panel here",
          "`!sendorderpanel` - post the order panel here",
          "`!supporton` / `!supportoff` - toggle support",
          "`!prefixlogs` - recent ! commands by staff",
          "",
          "**Tickets (slash)**",
          "`/ticket add`, `/ticket escalated`, `/closerequest`, `/orderinfo`",
        ].join("\n"),
      ),
    );
    await out(message).send({ flags: V2FLAG, components: [c] });
  },
};

const serverinfo: PrefixCommand = {
  name: "serverinfo",
  description: "Get info about this server",
  execute: async (message) => {
    const g = message.guild;
    if (!g) return;
    const c = container();
    c.addTextDisplayComponents(text(`## ${g.name}`));
    c.addSeparatorComponents(separator());
    c.addTextDisplayComponents(
      text(
        [
          `**Members:** ${g.memberCount}`,
          `**Channels:** ${g.channels.cache.size}`,
          `**Roles:** ${g.roles.cache.size}`,
          `**Created:** <t:${Math.floor(g.createdTimestamp / 1000)}:D>`,
          `**Owner:** <@${g.ownerId}>`,
        ].join("\n"),
      ),
    );
    await out(message).send({ flags: V2FLAG, components: [c] });
  },
};

const userinfo: PrefixCommand = {
  name: "userinfo",
  description: "Get info about a user",
  execute: async (message) => {
    const member = (message.mentions.members?.first() ?? message.member) as GuildMember | null;
    if (!member) return;
    const roles =
      member.roles.cache
        .filter((r) => r.id !== message.guild!.roles.everyone.id)
        .map((r) => `<@&${r.id}>`)
        .join(" ") || "none";
    const c = container().addTextDisplayComponents(
      text(`## ${member.user.tag}`),
      text(
        [
          `**ID:** ${member.id}`,
          `**Joined:** <t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:D>`,
          `**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
          `**Roles:** ${roles}`,
        ].join("\n"),
      ),
    );
    await out(message).send({ flags: V2FLAG, components: [c] });
  },
};

const avatar: PrefixCommand = {
  name: "avatar",
  description: "Get a user's avatar",
  execute: async (message) => {
    const user = message.mentions.users.first() ?? message.author;
    await out(message).send({ content: user.displayAvatarURL({ size: 1024, extension: "png" }) });
  },
};

export const generalPrefix: PrefixCommand[] = [ping, commands, serverinfo, userinfo, avatar];
