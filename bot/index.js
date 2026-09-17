// =====================================================================
//  Discord Security Bot
//  Anti-Nuke + Telex + HI/IA Cases + Quest + Seal + Staff Cards
//  Storage: data.json (always) + Supabase (if configured)
// =====================================================================

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  FileUploadBuilder,
  ActivityType,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} = require('discord.js');

const config = require('./config.json');
const { saveImage } = require('./storage');
let sendTelexToPrinter = () => {};
try { ({ sendTelexToPrinter } = require('./telex-print')); } catch { /* printing disabled */ }
const DATA_PATH = path.join(__dirname, 'data.json');

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const EMJ = config.emojis || { stop: '🛑', logo: '' };

// ---------------------------------------------------------------------
//  Supabase (optional — bot works without it)
// ---------------------------------------------------------------------
let supabase = null;
try {
  if (
    config.supabaseUrl && config.supabaseKey &&
    !String(config.supabaseUrl).includes('PUT_') &&
    !String(config.supabaseKey).includes('PUT_')
  ) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
    console.log('🗄️  Supabase connected.');
  } else {
    console.log('ℹ️  Supabase not configured — using local data.json only.');
  }
} catch (err) {
  console.error('⚠️ Supabase init failed (local storage will be used):', err.message);
}

async function dbSaveCase(c) {
  if (!supabase) return;
  try {
    await supabase.from('cases').upsert({
      number: c.number, dept: c.dept, status: c.status, lead_id: c.leadId,
      date_opened: c.dateOpened, date_submitted: c.dateSubmitted,
      investigators: c.investigators, subject_id: c.subjectId,
      subject_username: c.subjectUsername, subject_role: c.subjectRole,
      roblox_username: c.robloxUsername, roblox_id: c.robloxId,
      violations: c.violations, sanction: c.sanction, public: c.public,
      proof_image: c.proofImage, proof_link: c.proofLink, channel_id: c.channelId,
      source: c.source || null
    });
  } catch (err) { console.error('⚠️ Supabase case save failed:', err.message); }
}
async function dbSaveCard(card) {
  if (!supabase) return;
  try {
    await supabase.from('staff_cards').upsert({
      user_id: card.userId, dept: card.dept, role_id: card.roleId,
      role_name: card.roleName, status: card.status, roblox: card.roblox,
      since: card.since, staff_id: card.staffId, inspection_id: card.inspectionId,
      type_id: card.typeId || 'permanent',
      access_card_url: card.accessCardUrl,
      pro_card_url: card.proCardUrl, updated_at: new Date().toISOString()
    });
  } catch (err) { console.error('⚠️ Supabase card save failed:', err.message); }
}
async function dbDeleteCard(userId) {
  if (!supabase) return;
  try { await supabase.from('staff_cards').delete().eq('user_id', userId); }
  catch (err) { console.error('⚠️ Supabase card delete failed:', err.message); }
}
async function dbSaveSrecord(r) {
  if (!supabase) return;
  try {
    await supabase.from('staff_records').upsert({
      user_id: r.userId, username: r.username, staff_id: r.staffId,
      position_role_id: r.positionRoleId, position_role_name: r.positionRoleName,
      staff_join_date: r.joinDate, was_inspection: r.wasInspection, status: r.status,
      old_matricule: r.oldMatricule, roblox: r.roblox, roblox_id: r.robloxId,
      staff_rate: r.rate, acceptance: r.acceptance,
      locked: r.locked || false, locked_by: r.lockedBy || null,
      updated_at: new Date().toISOString()
    });
  } catch (err) { console.error('⚠️ Supabase srecord save failed:', err.message); }
}
async function dbSaveSlog(userId, log) {
  if (!supabase) return;
  try {
    await supabase.from('staff_logs').insert({
      log_id: log.id, user_id: userId, type: log.type,
      reason: log.reason, message: log.message, added_by: log.by, added_at: log.at
    });
  } catch (err) { console.error('⚠️ Supabase slog save failed:', err.message); }
}
async function dbDeleteSlog(userId, logId) {
  if (!supabase) return;
  try { await supabase.from('staff_logs').delete().eq('user_id', userId).eq('log_id', logId); }
  catch (err) { console.error('⚠️ Supabase slog delete failed:', err.message); }
}
async function dbSaveZsar(userId, z) {
  if (!supabase) return;
  try {
    await supabase.from('zsar_cards').upsert({
      user_id: userId, type: z.type, card_url: z.cardUrl,
      letters: z.letters || [], expires_at: z.expiresAt || null,
      added_by: z.addedBy, updated_at: new Date().toISOString()
    });
  } catch (err) { console.error('⚠️ Supabase zsar save failed:', err.message); }
}
async function dbDeleteZsar(userId) {
  if (!supabase) return;
  try { await supabase.from('zsar_cards').delete().eq('user_id', userId); }
  catch (err) { console.error('⚠️ Supabase zsar delete failed:', err.message); }
}
async function dbSaveMProfile(p) {
  if (!supabase) return;
  try {
    await supabase.from('milweb_profiles').upsert({
      user_id: p.userId, username: p.username, avatar: p.avatar || null, staff_id: p.staffId,
      join_date: p.joinDate, security_rate: p.securityRate,
      position_role_id: p.positionRoleId, position_role_name: p.positionRoleName,
      status: p.status, activity_rate: p.activityRate,
      infraction_past: p.infractionPast, old_staff: p.oldStaff,
      roblox: p.roblox, roblox_id: p.robloxId, division: p.division, note: p.note,
      locked: p.locked || false, locked_by: p.lockedBy || null,
      updated_at: new Date().toISOString()
    });
  } catch (err) { console.error('⚠️ Supabase mprofile save failed:', err.message); }
}
async function dbSaveMLog(userId, log) {
  if (!supabase) return;
  try {
    await supabase.from('milweb_logs').insert({
      log_id: log.id, user_id: userId, type: log.type, text: log.text,
      added_by: log.byName || log.by, added_at: log.at
    });
  } catch (err) { console.error('⚠️ Supabase mlog save failed:', err.message); }
}
async function dbSaveSSU(s) {
  if (!supabase) return;
  try {
    await supabase.from('ssu_logs').insert({
      number: s.number || null, type: s.type, rate: s.rate, abuse: s.abuse, fulls: s.fulls,
      added_by: s.by, added_at: s.at
    });
  } catch (err) { console.error('⚠️ Supabase ssu save failed:', err.message); }
}
async function dbSaveQuestResponse(q, answer) {
  if (!supabase) return;
  try {
    await supabase.from('quest_responses').insert({
      quest_id: q.key, dept: q.dept, qtype: q.qtype, target_id: q.targetId,
      issuer_id: q.issuerId, question: q.question, answer
    });
  } catch (err) { console.error('⚠️ Supabase quest save failed:', err.message); }
}

// ---------------------------------------------------------------------
//  Local persistent data
// ---------------------------------------------------------------------
const DEFAULT_DATA = {
  alertChannelId: null,
  telexIaChannelId: null,
  telexHiChannelId: null,
  announceStaffChannelId: null,
  questLogChannelId: null,
  sealLogChannelId: null,
  caseLogChannelId: null,
  zsarReqChannelId: null,
  staffRoleId: null,
  hiRoleId: null,
  iaRoleId: null,
  caseCounters: {},
  cases: {},
  infractions: {},
  staffCards: {},
  activeQuests: {},
  srecords: {},
  zsarCards: {},
  mprofiles: {},
  ssuLogs: [],
  botStatus: 'online',
  botActivityType: 'custom',
  botActivityText: 'helping HI and IA to catch the potential raid threat and abuser'
};
function loadData() {
  try { return Object.assign({}, DEFAULT_DATA, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))); }
  catch { return { ...DEFAULT_DATA }; }
}
function saveData(d) { fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2)); }
let data = loadData();
let fortress = null; // assigned near the end, once all helpers exist

const pendingCases = new Map();
const milwebPanels = new Map(); // key -> { runnerId, warned:Set }
const pendingMails = new Map();  // key -> { senderId, targetId, attachmentUrl }

// ---------------------------------------------------------------------
//  Client
// ---------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message]
});

// ---------------------------------------------------------------------
//  Bot presence (status + activity), configurable with /tset
// ---------------------------------------------------------------------
const ACTIVITY_TYPES = {
  playing:   ActivityType.Playing,
  listening: ActivityType.Listening,
  watching:  ActivityType.Watching,
  competing: ActivityType.Competing,
  custom:    ActivityType.Custom
};
function applyPresence() {
  try {
    const type = ACTIVITY_TYPES[data.botActivityType] ?? ActivityType.Custom;
    const text = data.botActivityText || 'helping HI and IA to catch the potential raid threat and abuser';
    const activity = { name: text, type };
    if (type === ActivityType.Custom) activity.state = text; // custom status uses "state"
    client.user.setPresence({
      status: data.botStatus || 'online', // online / idle / dnd / invisible
      activities: [activity]
    });
    console.log(`🎭 Presence set: ${data.botStatus} [${data.botActivityType}] ${text}`);
  } catch (err) {
    console.error('⚠️ Failed to set presence:', err.message);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log('🛡️  Anti-nuke + Telex + Cases + Quest + Seal + Cards + ZSAR ready.');
  applyPresence();
  if (fortress) { fortress.startWatch(); console.log('🏰 Fortress security system armed.'); }

  // Deactivate expired temporary ZSAR cards (checked every 5 minutes)
  setInterval(async () => {
    const now = Date.now();
    for (const [uid, z] of Object.entries(data.zsarCards)) {
      if (z.type === 'temporary' && z.expiresAt && now > z.expiresAt) {
        delete data.zsarCards[uid];
        saveData(data);
        await dbDeleteZsar(uid);
        try {
          const u = await client.users.fetch(uid);
          await u.send(`<@${uid}> ⌛ **Your temporary ZSAR card has expired and has been deactivated automatically.**`);
        } catch {}
        console.log(`⌛ Temporary ZSAR card expired for ${uid}`);
      }
    }
  }, 5 * 60 * 1000);

  // Milweb outbox: send DMs the website asked for (every 60s)
  setInterval(async () => {
    if (!supabase) return;
    try {
      const { data: rows } = await supabase.from('milweb_outbox').select('*').eq('sent', false).limit(20);
      for (const row of rows || []) {
        try {
          const u = await client.users.fetch(row.user_id);
          await u.send(`<@${row.user_id}> ${row.message}`);
        } catch {}
        await supabase.from('milweb_outbox').update({ sent: true }).eq('id', row.id);
      }
    } catch (err) { console.error('Outbox error:', err.message); }
  }, 60 * 1000);
});

// =====================================================================
//  HELPERS
// =====================================================================
function telexTransform(text) {
  return text.replace(/['’‘`,.]/g, '').toUpperCase();
}
function deptLongName(dept) {
  return dept === 'HI' ? 'Higher Inspection' : 'Internal Affairs';
}
function hasCaseAccess(member) {
  if (!member) return { ok: false, dept: null };
  if (config.whitelist.includes(member.id)) return { ok: true, dept: 'HI' };
  const isHI = data.hiRoleId && member.roles.cache.has(data.hiRoleId);
  const isIA = data.iaRoleId && member.roles.cache.has(data.iaRoleId);
  if (isHI) return { ok: true, dept: 'HI' }; // HI wins if both
  if (isIA) return { ok: true, dept: 'IA' };
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return { ok: true, dept: 'HI' };
  return { ok: false, dept: null };
}
function nextCaseNumber(dept) {
  const year = new Date().getFullYear();
  const key = `${dept}-${year}`;
  const n = (data.caseCounters[key] || 0) + 1;
  data.caseCounters[key] = n;
  saveData(data);
  return `${dept}-${year}-${String(n).padStart(4, '0')}`;
}
async function fetchRobloxId(username) {
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });
    const json = await res.json();
    if (json && json.data && json.data[0]) return String(json.data[0].id);
  } catch (err) { console.error('⚠️ Roblox API failed:', err.message); }
  return 'Unknown';
}
function parseUsDate(str) {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, mm, dd, yy, HH, MM] = m.map(Number);
  const d = new Date(2000 + yy, mm - 1, dd, HH, MM);
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

// =====================================================================
//  PART 1 — ANTI-NUKE
// =====================================================================
client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.user.bot) return;
  const guild = member.guild;
  const invitationTime = new Date();

  let inviterId = null;
  try {
    await wait(2000);
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = logs.entries.find((e) => e.target && e.target.id === member.id);
    if (entry) inviterId = entry.executor ? entry.executor.id : null;
  } catch (err) { console.error('⚠️ Audit logs failed:', err.message); }

  if (inviterId && config.whitelist.includes(inviterId)) return;

  let botKicked = false;
  try { await member.kick('Unauthorized bot addition (anti-raid protection).'); botKicked = true; }
  catch (err) { console.error('❌ Kick failed:', err.message); }

  let inviter = null, rolesRemoved = false, timedOut = false;
  if (inviterId && !config.whitelist.includes(inviterId)) {
    inviter = await guild.members.fetch(inviterId).catch(() => null);
    if (inviter) {
      try { await inviter.roles.set([], 'Unauthorized bot addition.'); rolesRemoved = true; }
      catch (err) { console.error('❌ Role removal failed:', err.message); }
      try { await inviter.timeout(config.timeoutDurationMs, 'Unauthorized bot addition.'); timedOut = true; }
      catch (err) { console.error('❌ Timeout failed:', err.message); }
    }
  }

  const inviterLabel = inviter ? `${inviter.user.tag} (${inviterId})` : (inviterId || 'Unknown');
  let inviterAction = 'Inviter not found / no action taken';
  if (inviter) {
    inviterAction = (rolesRemoved ? 'All roles removed ✅' : 'Role removal FAILED ❌') + '\n' +
                    (timedOut ? '1 week timeout ✅' : 'Timeout FAILED ❌');
  }

  const embed = new EmbedBuilder()
    .setColor(0xff2b2b)
    .setTitle('🚨 Unauthorized Bot Removed')
    .setDescription('Anti-raid protection triggered. Please verify with your staff team.')
    .addFields(
      { name: 'Bot name', value: `${member.user.tag}`, inline: true },
      { name: 'Bot ID', value: `${member.id}`, inline: true },
      { name: 'Bot kicked', value: botKicked ? 'Yes ✅' : 'FAILED ❌', inline: true },
      { name: 'Invited by', value: inviterLabel, inline: false },
      { name: 'Invitation time', value: `<t:${Math.floor(invitationTime.getTime() / 1000)}:F>`, inline: false },
      { name: 'Action taken on inviter', value: inviterAction, inline: false }
    )
    .setFooter({ text: 'All actions were taken automatically. Staff review recommended.' })
    .setTimestamp();

  if (data.alertChannelId) {
    try { const ch = await client.channels.fetch(data.alertChannelId); if (ch) await ch.send({ embeds: [embed] }); }
    catch (err) { console.error('❌ Alert send failed:', err.message); }
  }
  for (const id of config.dmTargets) {
    try { const user = await client.users.fetch(id); await user.send({ content: `<@${id}>`, embeds: [embed] }); }
    catch (err) { console.error(`❌ DM ${id} failed:`, err.message); }
  }
});

// =====================================================================
//  MILWEB — revoke web access if the HI role is removed
// =====================================================================
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    if (!supabase || !data.hiRoleId) return;
    const hadHI = oldMember.roles.cache.has(data.hiRoleId);
    const hasHI = newMember.roles.cache.has(data.hiRoleId);
    if (hadHI && !hasHI) {
      await supabase.from('milweb_sessions').update({ active: false }).eq('discord_id', newMember.id);
      console.log(`🔒 Milweb access revoked for ${newMember.id} (HI role removed).`);
    }
  } catch (err) { console.error('Milweb revoke error:', err.message); }
});

// =====================================================================
//  PART 2 — TELEX
// =====================================================================
const TYPE_META = {
  raid_alert: { header: 'RAID ALERT', color: 0xff2b2b },
  announce:   { header: 'ANNOUNCE',   color: 0x2ecc71 },
  warning:    { header: 'WARNING',    color: 0xf1c40f },
  blacklist:  { header: 'BLACKLIST',  color: 0x000000 },
  case:       { header: 'CASE',       color: 0x3498db }
};
function buildTelexEmbed(type, message, sender) {
  const meta = TYPE_META[type] || { header: 'TELEX', color: 0x95a5a6 };
  const body = telexTransform(message);
  const now = new Date();
  const stamp =
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0');
  return new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`📠 ${meta.header}`)
    .setDescription(
      '```\n' +
      `QD NYUCOWXH\n.NYUCOWYX ${stamp}\n${meta.header}\n\n${body}\n` +
      '```\n' +
      `${EMJ.logo} -# ${config.telexFooter}`
    )
    .addFields({ name: 'Submitter', value: `<@${sender.id}> ${sender.username} (\`${sender.id}\`)` })
    .setTimestamp();
}
// Builds the exact plain telex block that gets printed on the OKI ML420.
function buildTelexPlainText(type, message) {
  const meta = TYPE_META[type] || { header: 'TELEX' };
  const body = telexTransform(message);
  const now = new Date();
  const stamp =
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0');
  return `QD NYUCOWXH\n.NYUCOWYX ${stamp}\n${meta.header}\n\n${body}`;
}
function buildAnnounceContent(message) {
  return [
    `# HIGHER INSPECTION ALERT`,
    `-# PLEASE READ THE FOLLOWING CONTENT`,
    ``,
    `${message}`,
    ``,
    `${EMJ.logo} -# ${config.telexFooter}`
  ].join('\n');
}
function resolveTargets(dest) {
  switch (dest) {
    case 'ia':       return [data.telexIaChannelId];
    case 'hi':       return [data.telexHiChannelId];
    case 'ia_hi':    return [data.telexIaChannelId, data.telexHiChannelId];
    case 'all':      return [data.telexIaChannelId, data.telexHiChannelId];
    case 'announce': return [data.announceStaffChannelId];
    default:         return [];
  }
}

// =====================================================================
//  PART 3 — CASES
// =====================================================================
function buildCaseDescription(c) {
  const lines = [];
  lines.push(`__**${c.dept} Investigation:**__ \`Status: ${c.status}\``);
  lines.push(`-# Case File Number: __${c.number}__`);
  lines.push(`**Lead Investigator:** __<@${c.leadId}>__`);
  lines.push(`**Date Opened:** __<t:${c.dateOpened}:f>__`);
  lines.push(`**Investigator(s) (optional):** __${c.investigators || 'N/A'}__`);
  lines.push(`__**Subject(s) Of Investigation:**__`);
  lines.push(`**Identifier / Discord:** __${c.subjectId} / ${c.subjectUsername}__`);
  lines.push(`**@:** __<@${c.subjectId}>__`);
  lines.push(`**Server Position / Role:** __${c.subjectRole}__`);
  lines.push(`**Roblox Username(s):** __ID: ${c.robloxId} / ${c.robloxUsername}__`);
  lines.push(`__**Rule Violations**__`);
  c.violations.forEach((v, i) => lines.push(`- **Violation ${i + 1}:** ${v}`));
  lines.push(`__**Info & Approval**__`);
  lines.push(`Submitted By: __<@${c.leadId}>__ (${deptLongName(c.dept)})`);
  lines.push(`Date: __<t:${c.dateSubmitted}:f>__`);
  lines.push(`Sanctions: ${c.sanction || 'Awaiting'}`);
  if (c.sanctionReason) lines.push(`**Reason / notes:** ${c.sanctionReason}`);
  if (c.banned) lines.push(`**Server ban:** Yes`);
  if (c.leadershipRate) {
    lines.push(`\n__**Rate of Leadership**__`);
    lines.push(`Confirmed by: __<@${c.leadershipRate.byId}>__`);
    lines.push(`Sanction: **${c.leadershipRate.sanction}**`);
    if (c.leadershipRate.reason) lines.push(`Reason: ${c.leadershipRate.reason}`);
    lines.push(`Date: <t:${c.leadershipRate.at}:f>`);
  }
  if (Array.isArray(c.logs) && c.logs.length) {
    lines.push(`\n__**Logs**__`);
    for (const l of c.logs) lines.push(`- ${l.byName || 'Unknown'} — ${l.action}${l.sanction ? ` (${l.sanction})` : ''} <t:${l.at}:R>`);
  }
  if (c.sealed) lines.push(`\n${EMJ.stop || '🔒'} **Case sealed by <@${c.sealedBy}> — Archived** <t:${c.sealedAt}:f>`);
  if (c.proofLink) lines.push(`\n**Proof:** ${c.proofLink}`);
  if (EMJ.logo) lines.push(`\n${EMJ.logo}`);
  return lines.join('\n');
}
function buildCaseEmbed(c) {
  const e = new EmbedBuilder()
    .setColor(c.dept === 'HI' ? 0x1f4fbf : 0x3498db)
    .setTitle(`📁 Case ${c.number}`)
    .setDescription(buildCaseDescription(c))
    .setFooter({ text: `Submitted from ${c.source || 'NYUC Bot'}` })
    .setTimestamp();
  if (c.proofImage) e.setImage(c.proofImage);
  return e;
}
async function finalizeCase(interaction, key) {
  const p = pendingCases.get(key);
  if (!p) return;
  pendingCases.delete(key);

  const number = nextCaseNumber(p.dept);
  const caseObj = {
    number, dept: p.dept, status: p.status, leadId: p.creatorId,
    dateOpened: p.startDateUnix || Math.floor(Date.now() / 1000),
    dateSubmitted: Math.floor(Date.now() / 1000),
    investigators: p.investigators,
    subjectId: p.subjectId, subjectUsername: p.subjectUsername, subjectRole: p.subjectRole,
    robloxUsername: p.robloxUsername, robloxId: p.robloxId,
    violations: p.violations, sanction: p.sanction || null,
    public: p.public, proofImage: p.proofImage || null, proofLink: p.proofLink || null,
    channelId: interaction.channelId,
    caseType: p.caseType || 'awaiting',
    scope: p.scope || null,
    logs: [], sealed: false, archived: false, deleted: false, messageId: null,
    source: client.user ? client.user.username : 'NYUC Bot'
  };
  data.cases[number] = caseObj;

  // Finished at creation -> seal + archive + log (+ optional ban)
  if (p.caseType === 'finished' && p.sealedNow) {
    caseObj.sealed = true; caseObj.archived = true;
    caseObj.sealedBy = p.sealedNow.by; caseObj.sealedAt = caseObj.dateSubmitted;
    caseObj.sanctionBy = p.sealedNow.by; caseObj.sanctionByName = p.sealedNow.byName;
    caseObj.sanctionReason = p.sanctionReason || null;
    caseObj.banned = !!p.banned;
    caseObj.logs.push({ by: p.sealedNow.by, byName: p.sealedNow.byName, action: 'sanction added', sanction: caseObj.sanction, at: caseObj.dateSubmitted });
    if (caseObj.banned) {
      try { await interaction.guild.members.ban(caseObj.subjectId, { reason: `Case ${number} sanction` }); } catch (e) { console.error('case ban failed:', e.message); }
    }
  }

  saveData(data);
  await dbSaveCase(caseObj);

  try {
    const btnRow = buildCaseButtons(caseObj);
    const payload = { embeds: [buildCaseEmbed(caseObj)] };
    if (btnRow) payload.components = [btnRow];
    const posted = await interaction.channel.send(payload);
    caseObj.messageId = posted.id;
    saveData(data);
    await dbSaveCase(caseObj);
  }
  catch (err) { console.error('❌ Case post failed:', err.message); }

  // Also post in the dedicated case log channel (if set and different)
  if (data.caseLogChannelId && data.caseLogChannelId !== interaction.channelId) {
    try {
      const logCh = await client.channels.fetch(data.caseLogChannelId);
      if (logCh) await logCh.send({ embeds: [buildCaseEmbed(caseObj)] });
    } catch (err) { console.error('❌ Case log post failed:', err.message); }
  }

  try {
    const creator = await client.users.fetch(p.creatorId);
    await creator.send(`<@${p.creatorId}> 📁 Your case has been created: **${number}**. Use \`/case view number:${number}\` to view it.`);
  } catch {}

  // DM the subject
  try {
    const subject = await client.users.fetch(p.subjectId);
    if (caseObj.status === 'Awaiting') {
      const notice = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${EMJ.stop} ${p.dept} ACTIVE INVESTIGATION NOTICE ${EMJ.logo}`)
        .setDescription(
          `**You currently have an active investigation case opened against you by the ${deptLongName(p.dept)} department.**\n\n` +
          `An investigation is now in progress. During this period, you may be contacted and questioned by an authorized ${p.dept} agent, ` +
          `either directly or through this bot. Please remain available and cooperative.\n\n` +
          `Having an open case does not necessarily mean you are guilty of anything. It means a report or a situation involving you is being reviewed. ` +
          `You are expected to continue your duties normally, unless instructed otherwise by a supervisor.\n\n` +
          `If you have any question about this case, or if you believe this is a mistake, please open a **management ticket** in the server.\n\n` +
          `-# Do not attempt to delete messages or interfere with the investigation. Any interference may be added to the case file.`
        )
        .addFields({ name: 'Opened by', value: `<@${p.creatorId}>` })
        .setTimestamp();
      await subject.send({ content: `<@${p.subjectId}>`, embeds: [notice] });
    } else {
      const notice = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`${EMJ.stop} ${p.dept} INVESTIGATION OUTCOME NOTICE ${EMJ.logo}`)
        .setDescription(
          `**Following the review of the case opened against you by the ${deptLongName(p.dept)} department, you have been found in violation.**\n\n` +
          `The investigation is now concluded. The full details and the reason for this decision are recorded in your case file.\n\n` +
          `If you believe this is a mistake, or if you have any question about this outcome, please open a **management ticket** in the server.\n\n` +
          `-# Reply \`.case\` here in this DM to receive your full case file.`
        )
        .addFields(
          { name: 'Case File Number', value: `${number}`, inline: true },
          { name: 'Sanction', value: `${caseObj.sanction || 'None'}`, inline: true },
          { name: 'Issued by', value: `<@${p.creatorId}>`, inline: false }
        )
        .setTimestamp();
      await subject.send({ content: `<@${p.subjectId}>`, embeds: [notice] });
    }
  } catch (err) { console.error('⚠️ Subject DM failed:', err.message); }

  await interaction.followUp({ content: `✅ Case **${number}** created (status: ${caseObj.status}).`, ephemeral: true }).catch(() => {});
}

// =====================================================================
//  CASE SANCTION SYSTEM (3 types: awaiting / confirmation / finished)
// =====================================================================
const SANCTION_OPTIONS = [
  { label: 'Nothing', value: 'Nothing' },
  { label: 'Notice', value: 'Notice' },
  { label: 'Warning', value: 'Warning' },
  { label: 'Strike', value: 'Strike' },
  { label: 'Suspension', value: 'Suspension' },
  { label: 'Termination', value: 'Termination' },
  { label: 'Staff Blacklist', value: 'Staff Blacklist' },
  { label: 'Demotion', value: 'Demotion' }
];

function caseTypeMeta(t) {
  switch (t) {
    case 'confirmation': return { label: 'Confirmation Needed', color: 0xe67e22, emoji: EMJ.stop };
    case 'finished':     return { label: 'Finished', color: 0x2ecc71, emoji: EMJ.logo };
    default:             return { label: 'Awaiting Sanction', color: 0xf1c40f, emoji: EMJ.logo };
  }
}

// the rich sanction form (used by Add Sanction, Confirm, and Finished-at-creation)
function buildSanctionModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title || 'Apply Sanction');

  const sanction = new StringSelectMenuBuilder().setCustomId('sanction')
    .setPlaceholder('Choose a sanction').addOptions(SANCTION_OPTIONS);
  const duration = new TextInputBuilder().setCustomId('duration').setStyle(TextInputStyle.Short).setRequired(false)
    .setPlaceholder('e.g. 5d  (or "Member 5d" for a demotion)');
  const reason = new TextInputBuilder().setCustomId('reason').setStyle(TextInputStyle.Paragraph).setRequired(false)
    .setPlaceholder('Reason and notes (optional)');
  const proof = new FileUploadBuilder().setCustomId('proof').setRequired(false).setMinValues(0).setMaxValues(1);
  const ban = new StringSelectMenuBuilder().setCustomId('ban')
    .setPlaceholder('Ban the user from the server?')
    .addOptions({ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' });

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Sanction').setStringSelectMenuComponent(sanction),
    new LabelBuilder().setLabel('Duration / target role (optional)').setTextInputComponent(duration),
    new LabelBuilder().setLabel('Reason & notes (optional)').setTextInputComponent(reason),
    new LabelBuilder().setLabel('Proof (optional)').setFileUploadComponent(proof),
    new LabelBuilder().setLabel('Ban user (optional)').setStringSelectMenuComponent(ban)
  );
  return modal;
}

// read the sanction modal into a plain object
async function readSanctionModal(interaction) {
  const get = (id) => { try { return interaction.fields.getStringSelectValues(id)[0]; } catch { return null; } };
  const getText = (id) => { try { return (interaction.fields.getTextInputValue(id) || '').trim(); } catch { return ''; } };
  let proofImage = null;
  try {
    const up = interaction.fields.getField('proof');
    const att = up && up.attachments ? [...up.attachments.values()][0] : null;
    if (att) proofImage = await saveImage(supabase, att.url, 'proof');
  } catch {}
  return {
    sanction: get('sanction') || 'Nothing',
    duration: getText('duration') || null,
    reason: getText('reason') || null,
    ban: get('ban') === 'yes',
    proofImage
  };
}

// buttons shown under a posted case, based on its type
function buildCaseButtons(c) {
  if (c.sealed || c.caseType === 'finished') return null; // finished -> no button
  const row = new ActionRowBuilder();
  if (c.caseType === 'confirmation') {
    row.addComponents(new ButtonBuilder().setCustomId(`caseconfirm_${c.number}`)
      .setLabel('Confirm (Leadership)').setStyle(ButtonStyle.Success));
  } else {
    row.addComponents(new ButtonBuilder().setCustomId(`casesanction_${c.number}`)
      .setLabel('Add Sanction').setStyle(ButtonStyle.Primary));
  }
  return row;
}

// apply a sanction to a case (from Add Sanction or Confirm), edit + log + DM + seal
async function applyCaseSanction(c, data0, opts) {
  // opts: { sanction, duration, reason, ban, proofImage, byId, byName, isLeadership }
  c.sanction = opts.sanction + (opts.duration ? ` (${opts.duration})` : '');
  c.sanctionRaw = opts.sanction;
  c.sanctionBy = opts.byId;
  c.sanctionByName = opts.byName;
  c.sanctionAt = Math.floor(Date.now() / 1000);
  if (opts.reason) c.sanctionReason = opts.reason;
  if (opts.proofImage) c.proofImage = opts.proofImage;
  c.banned = !!opts.ban;

  c.logs = c.logs || [];
  c.logs.push({
    by: opts.byId, byName: opts.byName,
    action: opts.isLeadership ? 'leadership confirmation' : 'sanction added',
    sanction: c.sanction, at: c.sanctionAt
  });

  if (opts.isLeadership) {
    c.leadershipRate = { byId: opts.byId, byName: opts.byName, sanction: c.sanction, reason: opts.reason || null, at: c.sanctionAt };
    c.status = 'Confirmed';
  } else {
    c.status = 'Closed';
  }
  c.sealed = true;
  c.sealedBy = opts.byId;
  c.sealedAt = c.sanctionAt;
  c.archived = true;
  c.caseType = 'finished';

  return c;
}

// =====================================================================
//  PART 4 — QUEST
// =====================================================================
const COOLDOWN_MS = { h1: 3600000, h12: 43200000, h24: 86400000, inf: 0 };

function questIntro(qtype) {
  if (qtype === 'witness')
    return 'You are probably a **witness** of something. All answers will remain **anonymous to the accused**.';
  if (qtype === 'infract')
    return 'This question is related to a **reported infraction**.';
  return 'You have received an official question.';
}
function questTitle(dept, qtype) {
  if (qtype === 'witness') return `${dept} WITNESS QUESTION`;
  if (qtype === 'infract') return `${dept} INFRACTION QUESTION`;
  return `${dept} QUESTION`;
}
async function sendQuestDM(quest) {
  const target = await client.users.fetch(quest.targetId);
  const timeValue = quest.expiresAt ? `<t:${Math.floor(quest.expiresAt / 1000)}:R>` : 'No expiration';
  const embed = new EmbedBuilder()
    .setColor(quest.dept === 'HI' ? 0x1f4fbf : 0x3498db)
    .setTitle(`${EMJ.logo} ${questTitle(quest.dept, quest.qtype)}`.trim())
    .setDescription(
      `${questIntro(quest.qtype)}\n\n` +
      `**Question:**\n${quest.question}\n\n` +
      `Send your answer **here in this DM**, it will be automatically recorded.`
    )
    .addFields({ name: 'Time remaining', value: timeValue })
    .setFooter({ text: 'You are not necessarily in trouble.' })
    .setTimestamp();
  await target.send({ content: `<@${quest.targetId}>`, embeds: [embed] });
}

// =====================================================================
//  PART 5 — SEAL
// =====================================================================
function sealWord(type) { return type === 'locked' ? 'LOCKED' : 'SEALED'; }
function buildSealEmbed(dept, type, note, byUser) {
  const word = sealWord(type);
  const e = new EmbedBuilder()
    .setColor(type === 'locked' ? 0xe67e22 : 0xc0392b)
    .setTitle(`${word}: DO NOT DELETE ANY MESSAGE`)
    .setDescription(
      `# ${EMJ.stop} **${word}** ${EMJ.logo}\n` +
      `**${deptLongName(dept)} is currently conducting an investigation.**\n\n` +
      `This channel contains **evidence**. Do not delete, edit or remove any message until the ${word.toLowerCase()} is lifted.\n` +
      (note ? `\n**Note:** ${note}\n` : '')
    )
    .setTimestamp();
  if (byUser) e.setFooter({ text: `${word.toLowerCase()} by ${byUser.username}` });
  return e;
}

// =====================================================================
//  MILWEB PROFILES helpers
// =====================================================================
const MILWEB_LOG_URL = 'https://milweb.nyuc.app/log/'; // placeholder, update when Milweb site is live
const MSTATUS_LABEL = {
  under_investigation: 'Under investigation', active: 'Active', retired: 'Retired',
  suspended: 'Suspended', loa: 'LOA', inactive: 'Inactive', susp: 'Suspended'
};
function findMProfile(query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  if (data.mprofiles[q]) return data.mprofiles[q]; // by user id
  return Object.values(data.mprofiles).find((p) => (p.staffId || '').toLowerCase() === q) || null;
}

// Turn a Supabase row into the shape the embed expects
function rowToProfile(row, logRows) {
  return {
    userId: row.user_id,
    username: row.username,
    avatar: row.avatar,
    staffId: row.staff_id,
    joinDate: row.join_date,
    securityRate: row.security_rate,
    positionRoleId: row.position_role_id,
    positionRoleName: row.position_role_name,
    status: row.status,
    activityRate: row.activity_rate,
    infractionPast: row.infraction_past,
    oldStaff: row.old_staff,
    roblox: row.roblox,
    robloxId: row.roblox_id,
    division: row.division,
    note: row.note,
    locked: row.locked,
    lockedBy: row.locked_by,
    lockNote: row.lock_note,
    confirmedBy: row.confirmed_by,
    acceptanceType: row.acceptance_type,
    checksheetBy: row.checksheet_by,
    mat: row.mat,
    acceptance: row.acceptance,
    acceptanceRate: row.acceptance_rate,
    acceptanceDate: row.acceptance_date,
    qcActive: row.qc_active,
    qcBy: row.qc_by,
    logs: (logRows || []).map((l) => ({
      id: l.log_id,
      type: l.type,
      text: l.text,
      by: l.added_by,
      byName: l.added_by,
      at: l.added_at || Math.floor(new Date(l.created_at || Date.now()).getTime() / 1000)
    }))
  };
}

// Load a profile from Supabase first (so Milweb changes show up in Discord),
// and fall back to the local file if Supabase is off or the profile is not there.
async function getProfile(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  if (supabase) {
    try {
      // try by staff id (case insensitive), then by discord id
      let { data: rows } = await supabase.from('milweb_profiles').select('*').ilike('staff_id', q);
      if (!rows || rows.length === 0) {
        const r2 = await supabase.from('milweb_profiles').select('*').eq('user_id', q);
        rows = r2.data;
      }
      if (rows && rows.length > 0) {
        const row = rows[0];
        const { data: logs } = await supabase
          .from('milweb_logs').select('*').eq('user_id', row.user_id).order('id', { ascending: true });
        return rowToProfile(row, logs);
      }
    } catch (err) {
      console.error('⚠️ Supabase profile read failed, using local data:', err.message);
    }
  }
  return findMProfile(q);
}

// Next log id, counting what is already in Supabase
async function nextLogIdDb(userId, localProfile) {
  if (supabase) {
    try {
      const { count } = await supabase
        .from('milweb_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      return 'LOG-' + String((count || 0) + 1).padStart(4, '0');
    } catch {}
  }
  return nextMLogId(localProfile || { logCounter: 0 });
}

// Write a change back to Supabase so the website sees it right away
async function pushProfileChange(userId, fields) {
  if (!supabase) return;
  try {
    await supabase.from('milweb_profiles').update(fields).eq('user_id', userId);
  } catch (err) { console.error('⚠️ Supabase profile update failed:', err.message); }
}

// =====================================================================
//  INFRACTION SYSTEM — helpers
// =====================================================================

// Application emojis (they work everywhere the bot posts)
const INF_EMOJI = {
  trash: '<:trash2:1530931540299874376>',
  flag: '<:flag:1530931525145591971>',
  flagoff: '<:flagoff:1530931526391435305>',
  shieldalert: '<:shieldalert:1530931537124786406>',
  trianglealert: '<:trianglealert:1530931541302181959>',
  idcard: '<:idcard:1530931529746743326>',
  scrolltext: '<:scrolltext:1530931536214491329>',
  usercheck: '<:usercheck:1530931543051337758>',
  info: '<:info:1530931530791387306>',
  octagonx: '<:octagonx:1530931535388086405>',
  logowhite: '<:LOGOWHITE:1530926212791140443>',
  logo: '<:LOGO:1530925079913955418>'
};
// raw ids for button emojis (buttons need { id } not the <:x:id> string)
const INF_EMOJI_ID = {
  trash: '1530931540299874376',
  idcard: '1530931529746743326',
  scrolltext: '1530931536214491329'
};

const INFRACT_BLUE = 0x1d4ed8;
const INFRACT_GREY = 0x5a6069;

// unique id that is never reused (checked against stored infractions)
function genInfractionId() {
  let id;
  do {
    id = '';
    for (let i = 0; i < 17; i++) id += Math.floor(Math.random() * 10);
    // no leading zero so it always looks like the sample
    if (id[0] === '0') id = '1' + id.slice(1);
  } while (data.infractions && data.infractions[id]);
  return id;
}

// turn "5d" / "12d" / "dd/mm/yy" into a unix timestamp (or null)
function parseExpiration(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  const dMatch = s.match(/^(\d+)\s*d$/);
  if (dMatch) return Math.floor(Date.now() / 1000) + parseInt(dMatch[1], 10) * 86400;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let [, dd, mm, yy] = slash;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    const dt = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), 22, 0, 0);
    if (!isNaN(dt.getTime())) return Math.floor(dt.getTime() / 1000);
  }
  return null; // unknown format -> treated as no expiration
}

// the description changes with the infract_type (Normal / HI Case / Abuse)
function infractionDescription(inf) {
  if (inf.infractType === 'Abuse') {
    return 'This infraction was issued following an **abuse or raid attempt** against the server or the staff team. ' +
      'Such behaviour is taken very seriously and is fully documented by Higher Inspection.';
  }
  if (inf.infractType === 'HI Case') {
    return 'This infraction is part of a **Higher Inspection case**. It follows an internal review of staff conduct. ' +
      'Please cooperate with Higher Inspection regarding this matter.';
  }
  return 'Unfortunately, you have received a staff infraction due to a violation of staff expectations and guidelines. ' +
    'We expect all staff members to remain professional and follow server policies at all times.';
}

// Build the infraction as a Components V2 Container (buttons live INSIDE the box).
// opts: { withButtons: bool }
function buildInfractionContainer(inf, opts) {
  opts = opts || {};
  const title = inf.revoked
    ? 'Staff Infraction - Revoked'
    : `Staff Infraction${inf.infractType === 'Abuse' ? ' - Abuse' : ' - HI'}`;

  const lines = [];
  lines.push(`**Infraction Type:** ${inf.type}`);
  lines.push(`**Reason:** ${inf.reason}`);
  lines.push(`**User:** <@${inf.userId}>`);
  lines.push(`**Issued by:** <@${inf.issuedById}>`);
  lines.push(`**Notes:** ${inf.note}`);
  if (inf.expiration) lines.push(`**Expiration:** <t:${inf.expiration}:F>`);
  else lines.push('**Expiration:** Permanent');
  if (inf.proofLink) lines.push(`**Proof:** ${inf.proofLink}`);
  lines.push(`**Case ID:** ${inf.caseId}`);
  if (inf.hiCase) lines.push(`**HI Case ID:** ${inf.hiCase}`);
  if (inf.revoked) lines.push(`\n${INF_EMOJI.octagonx} **This infraction has been revoked by <@${inf.revokedBy}>.**`);

  const container = new ContainerBuilder()
    .setAccentColor(inf.revoked ? INFRACT_GREY : INFRACT_BLUE)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(infractionDescription(inf)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  // banner + optional proof image, inside the box
  const hasBanner = (() => { try { return fs.existsSync('./INFRACTIONS.png'); } catch { return false; } })();
  if (hasBanner || inf.proofImage) {
    const gallery = new MediaGalleryBuilder();
    if (hasBanner) gallery.addItems(new MediaGalleryItemBuilder().setURL('attachment://INFRACTIONS.png'));
    if (inf.proofImage) gallery.addItems(new MediaGalleryItemBuilder().setURL(inf.proofImage).setDescription('Proof'));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(gallery);
  }

  // buttons INSIDE the container
  if (opts.withButtons) {
    container.addActionRowComponents(buildInfractionButtons(inf));
  }

  return container;
}

// Ready-to-send payload (Components V2). opts: { withButtons, pingUserId }
function buildInfractionPayload(inf, opts) {
  opts = opts || {};
  const components = [];
  if (opts.pingUserId) {
    // a ping line above the container (still one V2 message)
    components.push(new TextDisplayBuilder().setContent(`<@${opts.pingUserId}>`));
  }
  components.push(buildInfractionContainer(inf, opts));

  const payload = {
    components,
    flags: MessageFlags.IsComponentsV2
  };
  const banner = infractionBannerFile();
  if (banner) payload.files = [banner];
  if (opts.pingUserId) payload.allowedMentions = { users: [opts.pingUserId] };
  return payload;
}

// buttons for the channel message (DM has none)
function buildInfractionButtons(inf) {
  const revoke = new ButtonBuilder()
    .setCustomId(`infract_revoke_${inf.caseId}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji({ id: INF_EMOJI_ID.trash })
    .setLabel(inf.revoked ? 'Revoked' : 'Revoke')
    .setDisabled(!!inf.revoked);

  const comps = [revoke];
  if (inf.hiCase) {
    comps.push(
      new ButtonBuilder()
        .setCustomId(`infract_case_${inf.caseId}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: INF_EMOJI_ID.idcard })
        .setLabel('Case')
    );
  }
  return new ActionRowBuilder().addComponents(comps);
}

// the local banner file, re-attached on every (re)send
function infractionBannerFile() {
  try {
    if (!fs.existsSync('./INFRACTIONS.png')) return null;
    return new AttachmentBuilder('./INFRACTIONS.png', { name: 'INFRACTIONS.png' });
  } catch { return null; }
}

// write a line into the infraction log channel
async function logInfract(text) {
  try {
    if (!data.infractLogChannelId) return;
    const ch = await client.channels.fetch(data.infractLogChannelId);
    if (ch) await ch.send(text);
  } catch (err) { console.error('infract log error:', err.message); }
}

// +1 / -1 the milweb infraction counter and add a log line
async function milwebInfractionChange(userId, delta, infType, caseId, revoked) {
  try {
    const p = await getProfile(userId);
    if (!p) return; // no milweb page -> nothing to do
    const current = Number(p.infractionPast || 0);
    const next = Math.max(0, current + delta);
    await pushProfileChange(userId, { infraction_past: next });
    if (data.mprofiles[userId]) { data.mprofiles[userId].infractionPast = next; saveData(data); }
    const log = {
      id: await nextLogIdDb(userId, data.mprofiles[userId]),
      type: revoked ? 'infraction revoked' : 'infraction',
      text: revoked
        ? `Infraction ${caseId} revoked (now ${next} total).`
        : `New ${infType} infraction (Case ID ${caseId}). Total: ${next}.`,
      by: 'HI',
      byName: 'Higher Inspection',
      at: Math.floor(Date.now() / 1000)
    };
    await dbSaveMLog(userId, log);
    if (data.mprofiles[userId]) {
      data.mprofiles[userId].logs = data.mprofiles[userId].logs || [];
      data.mprofiles[userId].logs.push(log);
      saveData(data);
    }
  } catch (err) { console.error('milweb infraction change error:', err.message); }
}
function nextMLogId(p) {
  const n = (p.logCounter || 0) + 1;
  p.logCounter = n;
  return `LOG-${String(n).padStart(4, '0')}`;
}
async function buildMProfileEmbed(p) {
  let avatarUrl = p.avatar || null;
  if (!avatarUrl) {
    try { const u = await client.users.fetch(p.userId); avatarUrl = u.displayAvatarURL(); } catch {}
  }
  const e = new EmbedBuilder()
    .setColor(p.locked ? 0xe67e22 : 0x1f4fbf)
    .setTitle(`${EMJ.logo} MILWEB STAFF PAGE`)
    .setDescription(
      `Staff profile of <@${p.userId}>` +
      (p.locked ? `\n${EMJ.stop} **This profile is locked by ${p.lockedBy}**${p.lockNote ? ` — ${p.lockNote}` : ''}` : '')
    )
    .addFields(
      { name: 'Staff ID', value: p.staffId || 'N/A', inline: true },
      { name: 'Discord', value: `${p.username || 'Unknown'} (\`${p.userId}\`)`, inline: true },
      { name: 'Status', value: MSTATUS_LABEL[p.status] || p.status || 'N/A', inline: true },
      { name: 'Staff join date', value: p.joinDate || 'N/A', inline: true },
      { name: 'Position', value: p.positionRoleId ? `<@&${p.positionRoleId}> (${p.positionRoleName})` : 'N/A', inline: true },
      { name: 'Old staff', value: p.oldStaff === true ? 'True' : p.oldStaff === false ? 'False' : 'N/A', inline: true },
      { name: 'Security rate', value: p.securityRate !== null && p.securityRate !== undefined ? `${p.securityRate}/10` : 'N/A', inline: true },
      { name: 'Activity rate', value: p.activityRate !== null && p.activityRate !== undefined ? `${p.activityRate}/10` : 'N/A', inline: true },
      { name: 'Past infractions', value: p.infractionPast !== null && p.infractionPast !== undefined ? String(p.infractionPast) : 'N/A', inline: true },
      ...(p.roblox ? [{ name: 'Roblox', value: `ID: ${p.robloxId || 'Unknown'} / ${p.roblox}`, inline: true }] : []),
      ...(p.division ? [{ name: 'Division', value: p.division, inline: true }] : []),
      ...(p.mat ? [{ name: 'Mat', value: p.mat, inline: true }] : []),
      ...(p.confirmedBy ? [{ name: 'Confirmed by', value: p.confirmedBy, inline: true }] : []),
      ...(p.acceptanceType ? [{ name: 'Acceptance type', value: p.acceptanceType, inline: true }] : []),
      ...(p.checksheetBy ? [{ name: 'CheckSheet approved by', value: p.checksheetBy, inline: true }] : []),
      { name: 'Acceptance', value: p.acceptance ? `✅ ${p.acceptanceRate != null ? p.acceptanceRate + '%' : 'Done'}` : '❌ Not done', inline: true },
      ...(p.qcActive ? [{ name: 'Quality control', value: `In progress by ${p.qcBy || 'HI'}`, inline: true }] : []),
      ...(p.note ? [{ name: 'Note', value: String(p.note).slice(0, 1024) }] : [])
    )
    .setFooter({ text: 'Connect to Milweb (NYUC) | Milweb v1 (beta)' })
    .setTimestamp();
  if (avatarUrl) e.setThumbnail(avatarUrl);

  const logs = p.logs || [];
  if (logs.length > 0) {
    const shown = logs.slice(-8);
    const lines = shown.map((l) =>
      `[\`${l.id}\`] [**${l.type.toUpperCase()}**](${MILWEB_LOG_URL}${l.id}) <t:${l.at}:d> by ${l.byName}\n> ${l.text}`
    );
    let value = lines.join('\n');
    if (value.length > 1024) value = value.slice(0, 1000) + '\n*…truncated*';
    e.addFields({ name: `Logs (${logs.length})${logs.length > 8 ? ', showing last 8' : ''}`, value });
  } else {
    e.addFields({ name: 'Logs (0)', value: '*No logs on this profile.*' });
  }
  return e;
}

// =====================================================================
//  ZSAR SYSTEM helpers
// =====================================================================
function isStaffTeam(member) {
  if (!member) return false;
  if (config.whitelist.includes(member.id)) return true;
  if (data.staffRoleId && member.roles.cache.has(data.staffRoleId)) return true;
  if (data.hiRoleId && member.roles.cache.has(data.hiRoleId)) return true;
  if (data.iaRoleId && member.roles.cache.has(data.iaRoleId)) return true;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return false;
}
// A user's ZSAR card: explicit zsar card, or auto from their HI/IA access card
function resolveZsar(userId) {
  if (data.zsarCards[userId]) return data.zsarCards[userId];
  const staffCard = data.staffCards[userId];
  if (staffCard && staffCard.accessCardUrl) {
    return {
      type: staffCard.dept.toLowerCase(), // 'hi' or 'ia' => supervising
      cardUrl: staffCard.accessCardUrl,
      letters: [],
      auto: true
    };
  }
  return null;
}
function buildZsarEmbed(z, user) {
  const isSup = z.type === 'hi' || z.type === 'ia';
  const typeLabel = isSup ? z.type.toUpperCase() : z.type.charAt(0).toUpperCase() + z.type.slice(1);
  const e = new EmbedBuilder()
    .setColor(isSup ? 0x1f4fbf : 0x2ecc71)
    .setTitle(isSup ? `${EMJ.logo} SUPERVISING ZSAR CARD (${z.type.toUpperCase()})` : `${EMJ.logo} ZSAR CARD`)
    .setDescription(`Holder: <@${user.id}> (${user.username})`)
    .addFields(
      { name: 'Type', value: typeLabel, inline: true },
      ...(z.letters && z.letters.length ? [{ name: 'Access letters', value: z.letters.join(', '), inline: true }] : []),
      ...(z.expiresAt ? [{ name: 'Expires', value: `<t:${Math.floor(z.expiresAt / 1000)}:R>`, inline: true }] : [])
    )
    .setImage(z.cardUrl)
    .setFooter({ text: 'NYUC ZSAR System' })
    .setTimestamp();
  return e;
}
const VALID_LETTERS = ['A', 'B', 'M', 'L'];
function parseLetters(str) {
  if (!str) return [];
  return [...new Set(str.toUpperCase().split(/[^ABML]+/).filter((c) => VALID_LETTERS.includes(c)))];
}

// =====================================================================
//  AGENT CARD EMBEDS (per Type ID)
// =====================================================================
function buildAgentCardEmbed(card, agentUser) {
  const dept = card.dept;
  const typeId = card.typeId || 'permanent';
  const e = new EmbedBuilder()
    .setColor(dept === 'HI' ? 0x1f4fbf : 0x3498db)
    .setThumbnail(agentUser.displayAvatarURL())
    .setTimestamp();

  // ----- TRIAL AGENT: minimal card, no IDs -----
  if (typeId === 'trial') {
    e.setTitle(`${EMJ.logo} TRIAL AGENT ${dept}`)
      .setDescription(
        `**${agentUser.username} is on trial.**\n` +
        `This identification was issued by NYUC Leadership.`
      )
      .addFields(
        ...(card.roblox ? [{ name: 'Roblox', value: card.roblox, inline: true }] : []),
        { name: 'Access card', value: 'Temporary', inline: true },
        { name: 'Status', value: card.status, inline: true }
      )
      .setFooter({ text: 'Trial agents are under evaluation by NYUC.' });
    return e;
  }

  const baseFields = [
    { name: 'Discord', value: `${agentUser.username} (\`${agentUser.id}\`)`, inline: false },
    { name: 'Role', value: `<@&${card.roleId}> (${card.roleName})`, inline: true },
    { name: 'Status', value: card.status, inline: true },
    ...(card.staffId ? [{ name: 'Staff ID', value: card.staffId, inline: true }] : []),
    ...(card.inspectionId ? [{ name: 'Inspection ID', value: card.inspectionId, inline: true }] : []),
    ...(card.roblox ? [{ name: 'Roblox', value: card.roblox, inline: true }] : []),
    ...(card.since ? [{ name: `${dept} since`, value: card.since, inline: true }] : [])
  ];

  // ----- AGENT LEADER: stars (HI = 5, IA = 3) -----
  if (typeId === 'leader') {
    const stars = dept === 'HI' ? '★★★★★' : '★★★';
    e.setTitle(`${EMJ.logo} ${dept} LEADER`)
      .setDescription(
        `**<@${agentUser.id}> is an official Leader of ${deptLongName(dept)}.**\n` +
        `This identification was issued by NYUC Leadership.\n\n` +
        `【${stars}】`
      )
      .addFields(
        ...baseFields,
        { name: 'Command authority', value: `Department Leader (${dept})`, inline: true }
      )
      .setFooter({ text: "Please comply with the agent's requests as long as they remain within the NYUC framework." });
    return e;
  }

  // ----- TEMPORARY AGENT: reduced rights notice + special footer -----
  if (typeId === 'temporary') {
    e.setTitle(`${EMJ.logo} ${dept} AGENT (TEMPORARY)`)
      .setDescription(
        `**<@${agentUser.id}> is an official, verified agent of ${deptLongName(dept)}.**\n` +
        `This identification was issued by NYUC Leadership.\n\n` +
        `This agent (${dept}) is **temporary** and has reduced rights compared to a permanent agent.`
      )
      .addFields(...baseFields)
      .setFooter({ text: 'This agent is temporary and therefore cannot request anything from you within the NYUC framework unless a permanent agent gives them authorization.' });
    return e;
  }

  // ----- CONTRIBUTOR AGENT: base card + contribution -----
  if (typeId === 'contributor') {
    e.setTitle(`${EMJ.logo} ${dept} AGENT (CONTRIBUTOR)`)
      .setDescription(
        `**<@${agentUser.id}> is an official, verified contributor agent of ${deptLongName(dept)}.**\n` +
        `This identification was issued by NYUC Leadership.`
      )
      .addFields(
        ...baseFields,
        { name: 'Contribution', value: `Contributor of ${deptLongName(dept)}`, inline: true }
      )
      .setFooter({ text: "Please comply with the agent's requests as long as they remain within the NYUC framework." });
    return e;
  }

  // ----- PERMANENT AGENT (default): unchanged -----
  e.setTitle(`${EMJ.logo} ${dept} AGENT`)
    .setDescription(
      `**<@${agentUser.id}> is an official, verified agent of ${deptLongName(dept)}.**\n` +
      `This identification was issued by NYUC Leadership.`
    )
    .addFields(...baseFields)
    .setFooter({ text: "Please comply with the agent's requests as long as they remain within the NYUC framework." });
  return e;
}

// =====================================================================
//  PART 6 — SRECORD (staff records, HI only)
// =====================================================================
function isHIOnly(member) {
  if (!member) return false;
  if (config.whitelist.includes(member.id)) return true;
  if (data.hiRoleId && member.roles.cache.has(data.hiRoleId)) return true;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return false;
}
function findSrecord(userOpt, staffIdOpt) {
  if (userOpt && data.srecords[userOpt.id]) return data.srecords[userOpt.id];
  if (staffIdOpt) {
    const sid = staffIdOpt.trim().toLowerCase();
    return Object.values(data.srecords).find((r) => (r.staffId || '').toLowerCase() === sid) || null;
  }
  return null;
}
function nextLogId(rec) {
  const n = (rec.logCounter || 0) + 1;
  rec.logCounter = n;
  return `L-${String(n).padStart(4, '0')}`;
}
const SREC_STATUS_LABEL = {
  valid: 'Valid', active: 'Active', suspended: 'Suspended', blacklisted: 'Blacklisted',
  under_investigation: 'Under investigation', dr: 'D/R', retired: 'Retired'
};
async function buildSrecordEmbed(rec) {
  let avatarUrl = null;
  try { const u = await client.users.fetch(rec.userId); avatarUrl = u.displayAvatarURL(); } catch {}
  const e = new EmbedBuilder()
    .setColor(rec.locked ? 0xe67e22 : 0x1f4fbf)
    .setTitle(`${EMJ.logo} Srecord for HI (only)`)
    .setDescription(`Staff record of <@${rec.userId}>${rec.locked ? `\n${EMJ.stop} **PROFILE LOCKED** (by <@${rec.lockedBy}>)` : ''}`)
    .addFields(
      { name: 'Discord', value: `${rec.username} (\`${rec.userId}\`)`, inline: true },
      { name: 'Staff ID', value: rec.staffId || 'N/A', inline: true },
      { name: 'Position', value: rec.positionRoleId ? `<@&${rec.positionRoleId}> (${rec.positionRoleName})` : 'N/A', inline: true },
      { name: 'Staff join date', value: rec.joinDate || 'N/A', inline: true },
      { name: 'Has been Inspection', value: rec.wasInspection ? 'True' : 'False', inline: true },
      { name: 'Status', value: SREC_STATUS_LABEL[rec.status] || rec.status || 'N/A', inline: true },
      ...(rec.oldMatricule ? [{ name: 'Old matricule', value: rec.oldMatricule, inline: true }] : []),
      ...(rec.roblox ? [{ name: 'Roblox', value: `ID: ${rec.robloxId || 'Unknown'} / ${rec.roblox}`, inline: true }] : []),
      ...(rec.rate !== null && rec.rate !== undefined ? [{ name: 'Staff rate', value: `${rec.rate}/10`, inline: true }] : []),
      ...(rec.acceptance !== null && rec.acceptance !== undefined ? [{ name: 'Acceptance', value: rec.acceptance ? 'True' : 'False', inline: true }] : [])
    )
    .setFooter({ text: 'Connect to Milweb (NYUC) & Srecord' })
    .setTimestamp();
  if (avatarUrl) e.setThumbnail(avatarUrl);

  const logs = rec.logs || [];
  if (logs.length > 0) {
    const shown = logs.slice(-8);
    const lines = shown.map((l) =>
      `[\`${l.id}\`] **${l.type}** by <@${l.by}> <t:${l.at}:d>\n> ${l.reason}${l.message ? ` | ${l.message}` : ''}`
    );
    let value = lines.join('\n');
    if (value.length > 1024) value = value.slice(0, 1000) + '\n*…truncated*';
    e.addFields({ name: `Logs (${logs.length})${logs.length > 8 ? ', showing last 8' : ''}`, value });
  } else {
    e.addFields({ name: 'Logs (0)', value: '*No logs on this profile.*' });
  }
  return e;
}

// =====================================================================
//  INTERACTIONS
// =====================================================================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ================= SLASH COMMANDS =================
    if (interaction.isChatInputCommand()) {
      // Fortress Mode 3: all commands disabled except for WL (and /fortress)
      if (fortress && fortress.commandsBlocked(interaction)) {
        return interaction.reply({ content: '🔴 The server is in lockdown (Fortress Mode 3). Commands are temporarily disabled.', ephemeral: true });
      }
      const isWhitelisted = config.whitelist.includes(interaction.user.id);
      const isAdmin = interaction.memberPermissions &&
        interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);

      // ---------- /alertset ----------
      if (interaction.commandName === 'alertset') {
        const channel = interaction.options.getChannel('channel');
        const code = interaction.options.getString('code');
        if (!isWhitelisted && !isAdmin) return interaction.reply({ content: '❌ Not allowed.', ephemeral: true });
        if (code !== config.alertCode) return interaction.reply({ content: '❌ Invalid code.', ephemeral: true });
        data.alertChannelId = channel.id;
        saveData(data);
        return interaction.reply({ content: `✅ Anti-raid alert channel set to ${channel}.`, ephemeral: true });
      }

      // ---------- /tset ----------
      if (interaction.commandName === 'tset') {
        const setting = interaction.options.getString('setting');
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const code = interaction.options.getString('code');
        if (!isWhitelisted && !isAdmin) return interaction.reply({ content: '❌ Not allowed.', ephemeral: true });
        if (code !== config.alertCode) return interaction.reply({ content: '❌ Invalid code.', ephemeral: true });

        // --- Bot presence settings ---
        if (setting === 'bot_status') {
          const status = interaction.options.getString('status');
          if (!status) return interaction.reply({ content: '❌ This setting needs the **status** option.', ephemeral: true });
          data.botStatus = status;
          saveData(data);
          applyPresence();
          return interaction.reply({ content: `✅ Bot status set to **${status}**.`, ephemeral: true });
        }
        if (setting === 'bot_activity') {
          const activityType = interaction.options.getString('activity_type');
          const text = interaction.options.getString('text');
          if (!activityType && !text)
            return interaction.reply({ content: '❌ Provide **activity_type** and/or **text**.', ephemeral: true });
          if (activityType) data.botActivityType = activityType;
          if (text) data.botActivityText = text;
          saveData(data);
          applyPresence();
          return interaction.reply({
            content: `✅ Bot activity set: **${data.botActivityType}**: "${data.botActivityText}"`,
            ephemeral: true
          });
        }

        const channelSettings = {
          telex_ia: 'telexIaChannelId',
          telex_hi: 'telexHiChannelId',
          announce_staff: 'announceStaffChannelId',
          alert: 'alertChannelId',
          quest_log: 'questLogChannelId',
          seal_log: 'sealLogChannelId',
          case_log: 'caseLogChannelId',
          zsar_req: 'zsarReqChannelId',
          infract_channel: 'infractChannelId',
          infract_log: 'infractLogChannelId'
        };
        const roleSettings = {
          hi_role: 'hiRoleId', ia_role: 'iaRoleId', staff_role: 'staffRoleId',
          quarantine_role: 'quarantineRoleId', investigation_role: 'investigationRoleId'
        };

        // ---- fortress: bot to watch (a bot ID as text) ----
        if (setting === 'watch_bot') {
          const botId = interaction.options.getString('text');
          if (!botId || !/^\d{5,25}$/.test(botId.trim()))
            return interaction.reply({ content: '❌ Give the bot ID in the **text** field (numbers only).', ephemeral: true });
          data.watchBotId = botId.trim();
          saveData(data);
          return interaction.reply({ content: `✅ Now watching bot ID \`${data.watchBotId}\`. Fortress Mode 1 will trigger if it goes offline.`, ephemeral: true });
        }

        // ---- fortress: lock / isolate channel lists (toggle add/remove) ----
        if (setting === 'fortress_lock' || setting === 'fortress_isolate') {
          if (!channel) return interaction.reply({ content: '❌ This setting needs a **channel** (adds or removes it from the list).', ephemeral: true });
          const key = setting === 'fortress_lock' ? 'fortressLockChannels' : 'fortressIsolateChannels';
          data[key] = data[key] || [];
          const i = data[key].indexOf(channel.id);
          let msg;
          if (i === -1) { data[key].push(channel.id); msg = `✅ ${channel} added to the ${setting} list (${data[key].length} total).`; }
          else { data[key].splice(i, 1); msg = `✅ ${channel} removed from the ${setting} list (${data[key].length} total).`; }
          saveData(data);
          return interaction.reply({ content: msg, ephemeral: true });
        }

        if (channelSettings[setting]) {
          if (!channel) return interaction.reply({ content: '❌ This setting needs a **channel**.', ephemeral: true });
          data[channelSettings[setting]] = channel.id;
          saveData(data);
          return interaction.reply({ content: `✅ **${setting}** set to ${channel}.`, ephemeral: true });
        }
        if (roleSettings[setting]) {
          if (!role) return interaction.reply({ content: '❌ This setting needs a **role**.', ephemeral: true });
          data[roleSettings[setting]] = role.id;
          saveData(data);
          return interaction.reply({ content: `✅ **${setting}** set to ${role}.`, ephemeral: true });
        }
        return interaction.reply({ content: '❌ Unknown setting.', ephemeral: true });
      }

      // ---------- /infract ----------
      if (interaction.commandName === 'infract') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'issue') {
          // HI only
          if (!isHIOnly(interaction.member))
            return interaction.reply({ content: '❌ Only Higher Inspection can issue infractions.', ephemeral: true });

          if (!data.infractChannelId)
            return interaction.reply({ content: '❌ No infraction channel set. Use `/tset infract_channel` first.', ephemeral: true });

          await interaction.deferReply({ ephemeral: true });

          const user = interaction.options.getUser('user');
          const type = interaction.options.getString('type');
          const reason = interaction.options.getString('reason');
          const note = interaction.options.getString('note');
          const infractType = interaction.options.getString('infract_type');
          const expirationRaw = interaction.options.getString('expiration');
          const proof = interaction.options.getAttachment('proof');
          const proofLink = interaction.options.getString('proof_link');
          const hiCaseRaw = interaction.options.getString('hi_case');
          const isPublic = interaction.options.getBoolean('public');

          // resolve a linked HI case (accept "0008" or "HI-2026-0008")
          let hiCase = null;
          if (hiCaseRaw) {
            const q = hiCaseRaw.trim().toUpperCase();
            if (data.cases[q]) hiCase = q;
            else {
              const found = Object.keys(data.cases).find((n) => n.endsWith(q) || n.endsWith(q.padStart(4, '0')));
              hiCase = found || q; // keep what the user typed even if not found
            }
          }

          // make the proof image permanent (Supabase storage)
          let proofImage = null;
          if (proof) proofImage = await saveImage(supabase, proof.url, 'infractions');

          const inf = {
            caseId: genInfractionId(),
            userId: user.id,
            userTag: user.username,
            type, reason, note, infractType,
            expiration: parseExpiration(expirationRaw),
            proofImage, proofLink: proofLink || null,
            hiCase,
            public: isPublic === null ? true : !!isPublic,
            issuedById: interaction.user.id,
            issuedByTag: interaction.user.username,
            channelId: data.infractChannelId,
            messageId: null,
            at: Math.floor(Date.now() / 1000),
            revoked: false, revokedBy: null, revokedAt: null
          };

          // post in the infraction channel (Components V2: buttons inside the box)
          let posted;
          try {
            const ch = await client.channels.fetch(data.infractChannelId);
            posted = await ch.send(buildInfractionPayload(inf, { withButtons: true }));
          } catch (err) {
            return interaction.editReply({ content: `❌ Could not post in the infraction channel: ${err.message}` });
          }
          inf.messageId = posted.id;

          // save
          data.infractions[inf.caseId] = inf;
          saveData(data);

          // milweb +1
          await milwebInfractionChange(user.id, +1, type, inf.caseId, false);

          // DM the user (no buttons, with ping)
          try {
            const u = await client.users.fetch(user.id);
            await u.send(buildInfractionPayload(inf, { withButtons: false, pingUserId: user.id }));
          } catch { /* DMs closed */ }

          // log
          await logInfract(`${INF_EMOJI.flag} **Infraction issued** \`${inf.caseId}\` (${type}) to <@${user.id}> by <@${interaction.user.id}> <t:${inf.at}:F>`);

          return interaction.editReply({ content: `✅ Infraction \`${inf.caseId}\` issued to <@${user.id}>.` });
        }

        return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
      }

      // ---------- /telex ----------
      if (interaction.commandName === 'telex') {
        if (!isWhitelisted && !isAdmin) return interaction.reply({ content: '❌ Not allowed.', ephemeral: true });
        const dest = interaction.options.getString('dest');
        const type = interaction.options.getString('type');
        const message = interaction.options.getString('message');
        const pingRole = interaction.options.getRole('ping');

        const targetIds = resolveTargets(dest).filter(Boolean);
        if (targetIds.length === 0)
          return interaction.reply({ content: '❌ No channel set for that destination. Use `/tset` first.', ephemeral: true });

        let payload;
        if (dest === 'announce') payload = { content: buildAnnounceContent(message) };
        else payload = { embeds: [buildTelexEmbed(type, message, interaction.user)] };
        if (pingRole) {
          payload.content = `${pingRole}` + (payload.content ? `\n${payload.content}` : '');
          payload.allowedMentions = { roles: [pingRole.id] };
        }

        let sent = 0;
        for (const id of targetIds) {
          try { const ch = await client.channels.fetch(id); if (ch) { await ch.send(payload); sent++; } }
          catch (err) { console.error(`❌ Telex failed for ${id}:`, err.message); }
        }

        // print the telex on the OKI ML420 (fire and forget, never blocks)
        try {
          const printText = dest === 'announce' ? telexTransform(message) : buildTelexPlainText(type, message);
          sendTelexToPrinter(printText);
        } catch (e) { console.error('telex print error:', e.message); }

        return interaction.reply({
          content: sent > 0 ? `✅ Telex sent to ${sent} channel(s).` : '❌ Could not send (check permissions).',
          ephemeral: true
        });
      }

      // ---------- /case ----------
      if (interaction.commandName === 'case') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
          const number = interaction.options.getString('number').toUpperCase().trim();
          const c = data.cases[number];
          if (!c) return interaction.reply({ content: `❌ Case \`${number}\` not found.`, ephemeral: true });
          const access = hasCaseAccess(interaction.member);
          if (!access.ok && !(c.public && c.subjectId === interaction.user.id))
            return interaction.reply({ content: '❌ You cannot view this case.', ephemeral: true });
          return interaction.reply({ embeds: [buildCaseEmbed(c)], ephemeral: true });
        }

        if (sub === 'start') {
          const access = hasCaseAccess(interaction.member);
          if (!access.ok)
            return interaction.reply({ content: '❌ You need the HI or IA role (set them with `/tset`).', ephemeral: true });

          const target = interaction.options.getUser('user');
          const forcedType = interaction.options.getString('type');
          const isPublic = interaction.options.getBoolean('public') || false;
          const proof = interaction.options.getAttachment('proof');
          const proofLink = interaction.options.getString('proof_link');
          const dept = forcedType || access.dept;

          const member = await interaction.guild.members.fetch(target.id).catch(() => null);
          const highestRole = member && member.roles.highest && member.roles.highest.id !== interaction.guild.id
            ? `<@&${member.roles.highest.id}>` : 'None';

          let staffRoleDate = 'Unknown';
          const staffRoleId = dept === 'HI' ? data.hiRoleId : data.iaRoleId;
          try {
            if (member && staffRoleId && member.roles.cache.has(staffRoleId)) {
              const logs = await interaction.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 50 });
              const entry = logs.entries.find(
                (e) => e.target && e.target.id === target.id &&
                  e.changes && e.changes.some((ch) => ch.key === '$add' && (ch.new || []).some((r) => r.id === staffRoleId))
              );
              if (entry) staffRoleDate = `<t:${Math.floor(entry.createdTimestamp / 1000)}:f>`;
            }
          } catch {}

          const key = `${interaction.user.id}-${Date.now()}`;
          pendingCases.set(key, {
            dept, creatorId: interaction.user.id, creatorUsername: interaction.user.username,
            subjectId: target.id, subjectUsername: target.username, subjectRole: highestRole,
            public: isPublic, proofImage: proof ? await saveImage(supabase, proof.url, 'proof') : null, proofLink: proofLink || null
          });

          const infoEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`📁 New ${dept} Case: Subject Info ${EMJ.logo}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
              { name: 'Username', value: target.username, inline: true },
              { name: 'ID', value: target.id, inline: true },
              { name: 'Mention', value: `<@${target.id}>`, inline: true },
              { name: 'Account created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:f>`, inline: true },
              { name: 'Joined server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` : 'Not in server', inline: true },
              { name: 'Highest role', value: highestRole, inline: true },
              { name: 'Staff role added', value: staffRoleDate, inline: true },
              { name: 'Case type', value: dept, inline: true },
              { name: 'Public case', value: isPublic ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: 'Press Start to fill the case form, or Cancel.' });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`case_go_${key}`).setLabel('Start').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`case_cancel_${key}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
          );
          return interaction.reply({ embeds: [infoEmbed], components: [row] });
        }
      }

      // ---------- /fastcase (direct case, Management- only) ----------
      if (interaction.commandName === 'fastcase') {
        const access = hasCaseAccess(interaction.member);
        if (!access.ok)
          return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });

        const target = interaction.options.getUser('user');
        const isPublic = interaction.options.getBoolean('public') || false;
        const proof = interaction.options.getAttachment('proof');
        const proofLink = interaction.options.getString('proof_link');
        const dept = access.dept;

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        const highestRole = member && member.roles.highest && member.roles.highest.id !== interaction.guild.id
          ? `<@&${member.roles.highest.id}>` : 'None';

        const key = `${interaction.user.id}-${Date.now()}`;
        pendingCases.set(key, {
          dept, creatorId: interaction.user.id, creatorUsername: interaction.user.username,
          subjectId: target.id, subjectUsername: target.username, subjectRole: highestRole,
          public: isPublic, proofImage: proof ? await saveImage(supabase, proof.url, 'proof') : null,
          proofLink: proofLink || null, isFast: true
        });

        const infoEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle(`⚡ Fast Case: Subject Info ${EMJ.logo}`)
          .setThumbnail(target.displayAvatarURL())
          .setDescription('**Fast cases are direct (no awaiting / no confirmation).**\nThey must only be used on **Management and below**. If the subject is above Management, use a normal `/case` instead.')
          .addFields(
            { name: 'Username', value: target.username, inline: true },
            { name: 'ID', value: target.id, inline: true },
            { name: 'Mention', value: `<@${target.id}>`, inline: true },
            { name: 'Highest role', value: highestRole, inline: true },
            { name: 'Public case', value: isPublic ? 'Yes' : 'No', inline: true }
          )
          .setFooter({ text: 'Press Start to fill the case form.' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`case_go_${key}`).setLabel('Start').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`case_cancel_${key}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [infoEmbed], components: [row] });
      }

      // ---------- /quest ----------
      if (interaction.commandName === 'quest') {
        const access = hasCaseAccess(interaction.member);
        if (!access.ok)
          return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });

        const target = interaction.options.getUser('user');
        const qtype = interaction.options.getString('type');
        const question = interaction.options.getString('question');
        const cooldown = interaction.options.getString('cooldown');

        const ms = COOLDOWN_MS[cooldown] ?? 0;
        const quest = {
          key: `${target.id}-${Date.now()}`,
          dept: access.dept,
          qtype,
          question,
          targetId: target.id,
          issuerId: interaction.user.id,
          expiresAt: ms ? Date.now() + ms : 0
        };

        try {
          await sendQuestDM(quest);
        } catch (err) {
          return interaction.reply({ content: `❌ Could not DM the user (their DMs may be closed).`, ephemeral: true });
        }

        data.activeQuests[target.id] = quest;
        saveData(data);
        return interaction.reply({ content: `✅ Question sent to <@${target.id}> (${access.dept}, ${qtype}).`, ephemeral: true });
      }

      // ---------- /seal ----------
      if (interaction.commandName === 'seal') {
        const access = hasCaseAccess(interaction.member);
        if (!access.ok) return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });

        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');
        const mlog = interaction.options.getInteger('m_log');
        const note = interaction.options.getString('note');
        const showUser = interaction.options.getBoolean('user') || false;

        await interaction.deferReply({ ephemeral: true });

        // Record last N messages to the seal log channel
        if (mlog && mlog > 0) {
          if (!data.sealLogChannelId) {
            await interaction.followUp({ content: '⚠️ No seal log channel set (`/tset seal_log`). Messages not recorded.', ephemeral: true });
          } else {
            try {
              const msgs = await channel.messages.fetch({ limit: Math.min(mlog, 50) });
              const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
              const lines = sorted.map((m) =>
                `[<t:${Math.floor(m.createdTimestamp / 1000)}:t>] **${m.author.username}** (\`${m.author.id}\`): ${m.content || '*<attachment/embed>*'}`
              );
              const logEmbed = new EmbedBuilder()
                .setColor(0xc0392b)
                .setTitle(`${EMJ.logo} Recorded messages: #${channel.name}`)
                .setDescription(lines.join('\n').slice(0, 4000) || '*No messages found.*')
                .setFooter({ text: `Recorded by ${interaction.user.username} (${sealWord(type)})` })
                .setTimestamp();
              const logCh = await client.channels.fetch(data.sealLogChannelId);
              await logCh.send({ embeds: [logEmbed] });
            } catch (err) {
              console.error('❌ Message recording failed:', err.message);
            }
          }
        }

        // Post the seal embed in the target channel
        try {
          await channel.send({ embeds: [buildSealEmbed(access.dept, type, note, showUser ? interaction.user : null)] });
        } catch (err) {
          return interaction.editReply({ content: `❌ Could not post in ${channel} (check permissions).` });
        }
        return interaction.editReply({ content: `✅ ${sealWord(type)} posted in ${channel}${mlog ? `. ${mlog} message(s) recorded.` : '.'}` });
      }

      // ---------- /sealr ----------
      if (interaction.commandName === 'sealr') {
        const access = hasCaseAccess(interaction.member);
        if (!access.ok) return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });

        const msg = interaction.options.getString('msg');
        const channel = interaction.options.getChannel('channel');
        const kind = interaction.options.getString('kind') || 'seal';
        const word = kind === 'lock' ? 'LOCK' : 'SEAL';

        let desc = `**The ${word.toLowerCase()} on this channel has been removed by ${deptLongName(access.dept)}.**`;
        if (msg === 'collected') desc += `\n\n✅ **Proof has been collected.** The recorded evidence is now part of the case file.`;
        if (msg === 'deleted') desc += `\n\nThe recorded messages have been processed and removed from the log.`;

        const e = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`${word} REMOVED ${EMJ.logo}`)
          .setDescription(desc)
          .setTimestamp();
        try { await channel.send({ embeds: [e] }); }
        catch { return interaction.reply({ content: `❌ Could not post in ${channel}.`, ephemeral: true }); }
        return interaction.reply({ content: `✅ ${word} removed message posted in ${channel}.`, ephemeral: true });
      }

      // ---------- /addcard ----------
      if (interaction.commandName === 'addcard') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only whitelisted users can manage agent cards.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser('user');
        const dept = interaction.options.getString('type');
        const role = interaction.options.getRole('role');
        const status = interaction.options.getString('status');
        const roblox = interaction.options.getString('roblox');
        const since = interaction.options.getString('since');
        const staffId = interaction.options.getString('staff_id');
        const inspectionId = interaction.options.getString('inspection_id');
        const typeId = interaction.options.getString('typeid');
        const accessCard = interaction.options.getAttachment('access_card');
        const proCard = interaction.options.getAttachment('pro_card');

        const prev = data.staffCards[user.id] || {};
        const card = {
          userId: user.id,
          username: user.username,
          dept,
          roleId: role.id,
          roleName: role.name,
          status,
          roblox: roblox || prev.roblox || null,
          since: since || prev.since || null,
          staffId: staffId || prev.staffId || null,
          inspectionId: inspectionId || prev.inspectionId || null,
          typeId: typeId || prev.typeId || 'permanent',
          accessCardUrl: accessCard ? await saveImage(supabase, accessCard.url, 'access') : (prev.accessCardUrl || null),
          proCardUrl: proCard ? await saveImage(supabase, proCard.url, 'pro') : (prev.proCardUrl || null)
        };
        data.staffCards[user.id] = card;
        saveData(data);
        await dbSaveCard(card);

        // DM the agent their new card with a preview
        try {
          const u = await client.users.fetch(user.id);
          await u.send({
            content: `<@${user.id}> 🪪 **You have received your card.** Here is a preview:`,
            embeds: [buildAgentCardEmbed(card, u)]
          });
        } catch (err) { console.error('⚠️ Card DM failed:', err.message); }

        return interaction.editReply({
          content: `✅ Card ${prev.userId ? 'updated' : 'created'} for <@${user.id}>: **${dept}**, type **${card.typeId}**, role **${role.name}**, status **${status}**.`
        });
      }

      // ---------- /delcard ----------
      if (interaction.commandName === 'delcard') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only whitelisted users can manage agent cards.', ephemeral: true });
        const user = interaction.options.getUser('user');
        if (!data.staffCards[user.id])
          return interaction.reply({ content: '❌ This user has no card.', ephemeral: true });
        delete data.staffCards[user.id];
        saveData(data);
        await dbDeleteCard(user.id);
        return interaction.reply({ content: `✅ Card removed for <@${user.id}>.`, ephemeral: true });
      }

      // ---------- /showcid ----------
      if (interaction.commandName === 'showcid') {
        const card = data.staffCards[interaction.user.id];
        if (!card)
          return interaction.reply({ content: '❌ Only registered HI/IA agents can use this command.', ephemeral: true });

        const target = interaction.options.getUser('user');
        const agent = interaction.user;

        const embed = buildAgentCardEmbed(card, agent);

        const buttons = [];
        if (card.accessCardUrl)
          buttons.push(new ButtonBuilder().setCustomId(`card_access_${agent.id}`).setLabel('Show Access Card').setStyle(ButtonStyle.Primary));
        if (card.proCardUrl)
          buttons.push(new ButtonBuilder().setCustomId(`card_pro_${agent.id}`).setLabel('Professional Card').setStyle(ButtonStyle.Secondary));

        try {
          const payload = { content: `<@${target.id}>`, embeds: [embed] };
          if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons)];
          await target.send(payload);
        } catch {
          return interaction.reply({ content: '❌ Could not DM this user (their DMs may be closed).', ephemeral: true });
        }
        return interaction.reply({ content: `✅ Your ${card.dept} identification was sent to <@${target.id}> in DM.`, ephemeral: true });
      }

      // ---------- /srecord ----------
      if (interaction.commandName === 'srecord') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Srecord is for HI only.', ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const staffIdOpt = interaction.options.getString('staff_id');
        if (!userOpt && !staffIdOpt)
          return interaction.reply({ content: '❌ Provide a **user** or a **staff_id**.', ephemeral: true });
        const rec = findSrecord(userOpt, staffIdOpt);
        if (!rec) return interaction.reply({ content: '❌ No staff record found.', ephemeral: true });
        const embed = await buildSrecordEmbed(rec);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ---------- /addsrec (whitelist only) ----------
      if (interaction.commandName === 'addsrec') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can manage staff records.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const staffId = interaction.options.getString('staff_id');
        const position = interaction.options.getRole('position');
        const joinDate = interaction.options.getString('staff_join_date');
        const wasInspection = interaction.options.getBoolean('was_inspection');
        const status = interaction.options.getString('status');
        const oldMatricule = interaction.options.getString('old_matricule');
        const roblox = interaction.options.getString('roblox');
        const rate = interaction.options.getNumber('staff_rate');
        const acceptance = interaction.options.getBoolean('acceptance');

        await interaction.deferReply({ ephemeral: true });

        const prev = data.srecords[user.id] || {};
        let robloxId = prev.robloxId || null;
        if (roblox && roblox !== prev.roblox) robloxId = await fetchRobloxId(roblox);

        const rec = {
          userId: user.id,
          username: user.username,
          staffId,
          positionRoleId: position.id,
          positionRoleName: position.name,
          joinDate,
          wasInspection: wasInspection,
          status,
          oldMatricule: oldMatricule || prev.oldMatricule || null,
          roblox: roblox || prev.roblox || null,
          robloxId,
          rate: (rate !== null && rate !== undefined) ? rate : (prev.rate ?? null),
          acceptance: (acceptance !== null && acceptance !== undefined) ? acceptance : (prev.acceptance ?? null),
          locked: prev.locked || false,
          lockedBy: prev.lockedBy || null,
          logCounter: prev.logCounter || 0,
          logs: prev.logs || []
        };
        data.srecords[user.id] = rec;
        saveData(data);
        await dbSaveSrecord(rec);
        return interaction.editReply({
          content: `✅ Staff record ${prev.userId ? 'updated' : 'created'} for <@${user.id}> (Staff ID: **${staffId}**, status: **${SREC_STATUS_LABEL[status] || status}**).`
        });
      }

      // ---------- /addslogs (HI only) ----------
      if (interaction.commandName === 'addslogs') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can add staff logs.', ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const staffIdOpt = interaction.options.getString('staff_id');
        const type = interaction.options.getString('type');
        const reason = interaction.options.getString('reason');
        const message = interaction.options.getString('message');

        const rec = findSrecord(userOpt, staffIdOpt);
        if (!rec) return interaction.reply({ content: '❌ No staff record found.', ephemeral: true });
        if (rec.locked)
          return interaction.reply({ content: `${EMJ.stop} This profile is **locked** (by <@${rec.lockedBy}>). No logs can be added.`, ephemeral: true });

        rec.logs = rec.logs || [];
        const log = {
          id: nextLogId(rec),
          type,
          reason,
          message: message || null,
          by: interaction.user.id,
          at: Math.floor(Date.now() / 1000)
        };
        rec.logs.push(log);
        saveData(data);
        await dbSaveSlog(rec.userId, log);
        return interaction.reply({
          content: `✅ Log **${log.id}** (${type}) added to <@${rec.userId}>'s record by <@${interaction.user.id}>.`,
          ephemeral: true
        });
      }

      // ---------- /lockprs (HI only, toggle) ----------
      if (interaction.commandName === 'lockprs') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can lock profiles.', ephemeral: true });
        const user = interaction.options.getUser('user');
        const rec = data.srecords[user.id];
        if (!rec) return interaction.reply({ content: '❌ No staff record found for this user.', ephemeral: true });

        if (rec.locked) {
          // Only the locker or the whitelist can unlock
          if (rec.lockedBy !== interaction.user.id && !isWhitelisted)
            return interaction.reply({ content: `❌ Only <@${rec.lockedBy}> (or the owner) can unlock this profile.`, ephemeral: true });
          rec.locked = false;
          rec.lockedBy = null;
          saveData(data);
          await dbSaveSrecord(rec);
          return interaction.reply({ content: `🔓 Profile of <@${user.id}> is now **unlocked**.`, ephemeral: true });
        } else {
          rec.locked = true;
          rec.lockedBy = interaction.user.id;
          saveData(data);
          await dbSaveSrecord(rec);
          return interaction.reply({ content: `${EMJ.stop} Profile of <@${user.id}> is now **LOCKED**. No logs can be added or deleted until unlocked.`, ephemeral: true });
        }
      }

      // ---------- /deltels (HI only) ----------
      if (interaction.commandName === 'deltels') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can delete staff logs.', ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const staffIdOpt = interaction.options.getString('staff_id');
        const logId = interaction.options.getString('log_id').trim().toUpperCase();

        const rec = findSrecord(userOpt, staffIdOpt);
        if (!rec) return interaction.reply({ content: '❌ No staff record found.', ephemeral: true });
        if (rec.locked)
          return interaction.reply({ content: `${EMJ.stop} This profile is **locked** (by <@${rec.lockedBy}>). No logs can be deleted.`, ephemeral: true });

        const idx = (rec.logs || []).findIndex((l) => l.id.toUpperCase() === logId);
        if (idx === -1) return interaction.reply({ content: `❌ Log \`${logId}\` not found on this profile.`, ephemeral: true });
        rec.logs.splice(idx, 1);
        saveData(data);
        await dbDeleteSlog(rec.userId, logId);
        return interaction.reply({ content: `🗑️ Log **${logId}** deleted from <@${rec.userId}>'s record.`, ephemeral: true });
      }

      // ---------- /reqcard (staff team) ----------
      if (interaction.commandName === 'reqcard') {
        if (!isStaffTeam(interaction.member))
          return interaction.reply({ content: '❌ Only the staff team can request a ZSAR card (set the role with `/tset staff_role`).', ephemeral: true });
        if (!data.zsarReqChannelId)
          return interaction.reply({ content: '❌ No ZSAR request channel set (`/tset zsar_req`).', ephemeral: true });

        const forYou = interaction.options.getBoolean('for_you');
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`${EMJ.logo} ZSAR Card Request`)
          .setDescription(
            `Click the button below to fill your ZSAR card request.\n` +
            `You will be asked for your **Roblox user**, your **Access letter(s)** (A, B, M, L) and the **reason**.`
          )
          .setFooter({ text: 'NYUC ZSAR System' });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`zsarreq_open_${forYou ? '1' : '0'}_${interaction.user.id}`)
            .setLabel('Request ZSAR Card')
            .setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [row] });
      }

      // ---------- /addcz (HI) ----------
      if (interaction.commandName === 'addcz') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can issue ZSAR cards.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const cardImg = interaction.options.getAttachment('card');
        const type = interaction.options.getString('type'); // temporary / permanent / visitor
        const letterStr = interaction.options.getString('letter');
        const letters = parseLetters(letterStr);

        if (type === 'permanent' && letters.length === 0)
          return interaction.reply({ content: '❌ A **permanent** card needs at least one access letter (A, B, M, L).', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const z = {
          type,
          cardUrl: await saveImage(supabase, cardImg.url, 'zsar'),
          letters,
          expiresAt: type === 'temporary' ? Date.now() + 24 * 3600000 : null,
          addedBy: interaction.user.id,
          addedAt: Math.floor(Date.now() / 1000)
        };
        data.zsarCards[user.id] = z;
        saveData(data);
        await dbSaveZsar(user.id, z);

        try {
          const u = await client.users.fetch(user.id);
          await u.send({
            content:
              `<@${user.id}> 🪪 **Here is your ZSAR card.** You can use \`/showzsar (user)\` to show your card.` +
              (type === 'temporary' ? `\nThis card is **temporary** and will be deactivated automatically in 24 hours.` : ''),
            embeds: [buildZsarEmbed(z, u)]
          });
        } catch (err) { console.error('⚠️ ZSAR DM failed:', err.message); }

        return interaction.editReply({
          content: `✅ ZSAR card (**${type}**${letters.length ? `, letters: ${letters.join(', ')}` : ''}) issued to <@${user.id}>.`
        });
      }

      // ---------- /showzsar ----------
      if (interaction.commandName === 'showzsar') {
        const z = resolveZsar(interaction.user.id);
        if (!z)
          return interaction.reply({ content: '❌ You do not have a ZSAR card.', ephemeral: true });
        if (z.expiresAt && Date.now() > z.expiresAt)
          return interaction.reply({ content: '❌ Your temporary ZSAR card has expired.', ephemeral: true });

        const target = interaction.options.getUser('user');
        try {
          await target.send({ content: `<@${target.id}>`, embeds: [buildZsarEmbed(z, interaction.user)] });
        } catch {
          return interaction.reply({ content: '❌ Could not DM this user (their DMs may be closed).', ephemeral: true });
        }
        return interaction.reply({ content: `✅ Your ZSAR card was shown to <@${target.id}> in DM.`, ephemeral: true });
      }

      // ---------- /addzsi (whitelist) ----------
      if (interaction.commandName === 'addzsi') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can add supervising ZSAR cards.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const cardImg = interaction.options.getAttachment('card');
        const type = interaction.options.getString('type'); // 'hi' or 'ia'
        const notify = interaction.options.getBoolean('notify');
        await interaction.deferReply({ ephemeral: true });

        const z = {
          type,
          cardUrl: await saveImage(supabase, cardImg.url, 'zsar'),
          letters: [],
          expiresAt: null,
          addedBy: interaction.user.id,
          addedAt: Math.floor(Date.now() / 1000)
        };
        data.zsarCards[user.id] = z;
        saveData(data);
        await dbSaveZsar(user.id, z);

        if (notify) {
          try {
            const u = await client.users.fetch(user.id);
            await u.send({
              content: `<@${user.id}> 🪪 **You are supervising ZSAR Card.** You can use \`/showzsar (user)\` to show your card.`,
              embeds: [buildZsarEmbed(z, u)]
            });
          } catch (err) { console.error('⚠️ ZSI DM failed:', err.message); }
        }
        return interaction.editReply({ content: `✅ Supervising ZSAR card (**${type.toUpperCase()}**) issued to <@${user.id}>.` });
      }

      // ---------- /delzsar (whitelist) ----------
      if (interaction.commandName === 'delzsar') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can remove ZSAR cards.', ephemeral: true });
        const user = interaction.options.getUser('user');
        if (!data.zsarCards[user.id])
          return interaction.reply({ content: '❌ This user has no ZSAR card.', ephemeral: true });
        delete data.zsarCards[user.id];
        saveData(data);
        await dbDeleteZsar(user.id);
        try {
          const u = await client.users.fetch(user.id);
          await u.send(`<@${user.id}> ${EMJ.stop} **Your card has been suspended.**`);
        } catch {}
        return interaction.reply({ content: `✅ ZSAR card removed for <@${user.id}> (user notified).`, ephemeral: true });
      }

      // ---------- /showcidhere ----------
      if (interaction.commandName === 'showcidhere') {
        const card = data.staffCards[interaction.user.id];
        if (!card)
          return interaction.reply({ content: '❌ Only registered HI/IA agents can use this command.', ephemeral: true });

        const cooldown = interaction.options.getString('cooldown');
        const COOLDOWNS_MS = {
          none: 0, m5: 5 * 60000, m15: 15 * 60000, m30: 30 * 60000,
          h1: 3600000, h24: 24 * 3600000, never: 0
        };
        const ms = COOLDOWNS_MS[cooldown] ?? 0;

        const embed = buildAgentCardEmbed(card, interaction.user);
        const buttons = [];
        if (card.accessCardUrl)
          buttons.push(new ButtonBuilder().setCustomId(`card_access_${interaction.user.id}`).setLabel('Show Access Card').setStyle(ButtonStyle.Primary));
        if (card.proCardUrl)
          buttons.push(new ButtonBuilder().setCustomId(`card_pro_${interaction.user.id}`).setLabel('Professional Card').setStyle(ButtonStyle.Secondary));

        const payload = { embeds: [embed], fetchReply: true };
        if (buttons.length) payload.components = [new ActionRowBuilder().addComponents(...buttons)];
        if (ms > 0) {
          embed.addFields({ name: 'Expires', value: `<t:${Math.floor((Date.now() + ms) / 1000)}:R>`, inline: true });
        }

        const sent = await interaction.reply(payload);
        if (ms > 0) {
          setTimeout(async () => {
            try { await sent.delete(); } catch {}
          }, ms);
        }
        return;
      }

      // ---------- /repincom ----------
      if (interaction.commandName === 'repincom') {
        const access = hasCaseAccess(interaction.member);
        if (!access.ok)
          return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const reportId = interaction.options.getString('report_id');
        const reason = interaction.options.getString('reason');
        const msg = interaction.options.getString('message');

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`${EMJ.stop} ${access.dept} REPORT NOTICE ${EMJ.logo}`)
          .setDescription(
            `**You have been reported by someone and a case is currently ongoing.**\n\n` +
            `An investigation regarding this report is in progress. You may be contacted by an authorized ${access.dept} agent. ` +
            `Please remain available and cooperative.\n\n` +
            `If you have any question, you can open a **management ticket** in the server.`
          )
          .addFields(
            { name: 'Report ID', value: reportId, inline: true },
            { name: 'Reason', value: reason, inline: true },
            { name: 'Message', value: msg.slice(0, 1024) }
          )
          .setFooter({ text: 'NYUC | This notice was issued automatically following a report.' })
          .setTimestamp();

        try {
          await user.send({ content: `<@${user.id}>`, embeds: [embed] });
        } catch {
          return interaction.reply({ content: '❌ Could not DM this user (their DMs may be closed).', ephemeral: true });
        }
        return interaction.reply({ content: `✅ Report notice sent to <@${user.id}> in DM (Report ID: **${reportId}**).`, ephemeral: true });
      }

      // ---------- /auth (HI): log in to Milweb with a code ----------
      if (interaction.commandName === 'auth') {
        if (!supabase)
          return interaction.reply({ content: '❌ Milweb database is not configured.', ephemeral: true });
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Milweb is for HI only.', ephemeral: true });

        const code = interaction.options.getString('code').trim().toUpperCase();

        // blocked users cannot log in
        const { data: blocked } = await supabase.from('milweb_blocklist').select('discord_id').eq('discord_id', interaction.user.id).maybeSingle();
        if (blocked)
          return interaction.reply({ content: '❌ Your Milweb access has been removed.', ephemeral: true });

        // find the pending session for this code
        const { data: sess } = await supabase.from('milweb_sessions').select('*').eq('code', code).eq('active', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!sess)
          return interaction.reply({ content: '❌ Invalid or expired code. Refresh the Milweb login page and try again.', ephemeral: true });

        // work out the permission level
        const isWl = config.whitelist.includes(interaction.user.id);
        let agentId = null;
        const card = data.staffCards[interaction.user.id];
        if (card && card.proCardUrl) agentId = card.inspectionId || card.staffId || ('agent-' + interaction.user.id.slice(-4));

        await supabase.from('milweb_sessions').update({
          discord_id: interaction.user.id,
          username: interaction.user.username,
          is_whitelist: isWl,
          agent_id: agentId,
          active: true
        }).eq('token', sess.token);

        return interaction.reply({
          content: `✅ You are now logged in to Milweb as **${isWl ? 'Owner' : agentId ? agentId : 'Visitor (view only)'}**. Go back to the website.`,
          ephemeral: true
        });
      }

      // ---------- /crdauth: log in to CRD with a code ----------
      if (interaction.commandName === 'crdauth') {
        if (!supabase)
          return interaction.reply({ content: '❌ CRD database is not configured.', ephemeral: true });

        const crdCode = interaction.options.getString('code').trim().toUpperCase();
        const isWlCrd = config.whitelist.includes(interaction.user.id);

        // find the pending session for this code
        const { data: crdSess } = await supabase.from('crd_sessions').select('*').eq('code', crdCode).eq('active', false).eq('denied', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!crdSess)
          return interaction.reply({ content: '❌ Invalid or expired code. Refresh the CRD login page and try again.', ephemeral: true });

        // authorization: whitelist always in, everyone else needs a grant
        let crdAuthorized = isWlCrd;
        if (!crdAuthorized) {
          const { data: crdGrant } = await supabase.from('crd_access').select('discord_id').eq('discord_id', interaction.user.id).maybeSingle();
          crdAuthorized = !!crdGrant;
        }

        if (!crdAuthorized) {
          await supabase.from('crd_sessions').update({
            discord_id: interaction.user.id, username: interaction.user.username, denied: true
          }).eq('token', crdSess.token);
          return interaction.reply({
            content: '❌ No authorization. Ask a whitelisted member to run `/crdaccess grant` for you.',
            ephemeral: true
          });
        }

        await supabase.from('crd_sessions').update({
          discord_id: interaction.user.id,
          username: interaction.user.username,
          is_whitelist: isWlCrd,
          active: true
        }).eq('token', crdSess.token);

        return interaction.reply({
          content: `✅ You are now logged in to CRD as **${isWlCrd ? 'Whitelist' : 'Reader'}**. Go back to the website.`,
          ephemeral: true
        });
      }

      // ---------- /crdaccess grant|revoke (whitelist only) ----------
      if (interaction.commandName === 'crdaccess') {
        const isWlCrdAccess = config.whitelist.includes(interaction.user.id);
        if (!isWlCrdAccess)
          return interaction.reply({ content: '❌ Only whitelisted members can manage CRD access.', ephemeral: true });
        if (!supabase)
          return interaction.reply({ content: '❌ CRD database is not configured.', ephemeral: true });

        const crdSub = interaction.options.getSubcommand();
        const crdUser = interaction.options.getUser('user');

        if (crdSub === 'grant') {
          await supabase.from('crd_access').upsert({
            discord_id: crdUser.id, granted_by: interaction.user.username, granted_at: Math.floor(Date.now() / 1000)
          });
          try { const u = await client.users.fetch(crdUser.id); await u.send(`<@${crdUser.id}> ✅ You have been granted access to CRD. Go to crd.nyuc.app and log in with /crdauth.`); } catch {}
          return interaction.reply({ content: `✅ Granted CRD access to <@${crdUser.id}>.`, ephemeral: true });
        }

        if (crdSub === 'revoke') {
          await supabase.from('crd_access').delete().eq('discord_id', crdUser.id);
          await supabase.from('crd_sessions').update({ active: false }).eq('discord_id', crdUser.id);
          try { const u = await client.users.fetch(crdUser.id); await u.send(`<@${crdUser.id}> ⛔ Your CRD access has been revoked.`); } catch {}
          return interaction.reply({ content: `✅ Revoked CRD access for <@${crdUser.id}>.`, ephemeral: true });
        }
      }

      // ---------- /crdmanage grant|revoke|list (whitelist only) ----------
      if (interaction.commandName === 'crdmanage') {
        if (!config.whitelist.includes(interaction.user.id))
          return interaction.reply({ content: '❌ Only whitelisted members can manage CRD access.', ephemeral: true });
        if (!supabase)
          return interaction.reply({ content: '❌ CRD database is not configured.', ephemeral: true });

        const crdMgSub = interaction.options.getSubcommand();

        if (crdMgSub === 'list') {
          const { data: crdRows } = await supabase.from('crd_access').select('*').order('granted_at', { ascending: false });
          if (!crdRows || !crdRows.length)
            return interaction.reply({ content: 'ℹ️ No one has been individually granted CRD access yet. Whitelisted members always have access.', ephemeral: true });
          const crdLines = crdRows.map((r) => `• <@${r.discord_id}>${r.username ? ` (${r.username})` : ''} — by ${r.granted_by || '?'}`).join('\n');
          return interaction.reply({ content: `**CRD access list (${crdRows.length}):**\n${crdLines}`.slice(0, 1900), ephemeral: true });
        }

        const crdMgUser = interaction.options.getUser('user');

        if (crdMgSub === 'grant') {
          await supabase.from('crd_access').upsert({
            discord_id: crdMgUser.id, username: crdMgUser.username,
            granted_by: interaction.user.username, granted_at: Math.floor(Date.now() / 1000)
          });
          try { const u = await client.users.fetch(crdMgUser.id); await u.send(`<@${crdMgUser.id}> ✅ You have been granted access to CRD. Go to the CRD site and log in with /crdauth.`); } catch {}
          return interaction.reply({ content: `✅ Granted CRD access to <@${crdMgUser.id}>.`, ephemeral: true });
        }

        if (crdMgSub === 'revoke') {
          await supabase.from('crd_access').delete().eq('discord_id', crdMgUser.id);
          await supabase.from('crd_sessions').update({ active: false }).eq('discord_id', crdMgUser.id);
          try { const u = await client.users.fetch(crdMgUser.id); await u.send(`<@${crdMgUser.id}> ⛔ Your CRD access has been revoked.`); } catch {}
          return interaction.reply({ content: `✅ Revoked CRD access for <@${crdMgUser.id}>.`, ephemeral: true });
        }
      }

      // ---------- /removebde (whitelist): remove someone's Milweb access ----------
      if (interaction.commandName === 'removebde') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can remove Milweb access.', ephemeral: true });
        if (!supabase)
          return interaction.reply({ content: '❌ Milweb database is not configured.', ephemeral: true });

        const user = interaction.options.getUser('user');
        await supabase.from('milweb_blocklist').upsert({ discord_id: user.id, blocked_by: interaction.user.id });
        await supabase.from('milweb_sessions').update({ active: false }).eq('discord_id', user.id);
        try { const u = await client.users.fetch(user.id); await u.send(`<@${user.id}> ${EMJ.stop} Your Milweb access has been removed. You have been disconnected.`); } catch {}
        return interaction.reply({ content: `✅ Milweb access removed for <@${user.id}> (disconnected).`, ephemeral: true });
      }

      // ---------- /mail ----------
      if (interaction.commandName === 'mail') {
        if (!isHIOnly(interaction.member) && !isWhitelisted)
          return interaction.reply({ content: '❌ Only HI can send mails.', ephemeral: true });

        const target = interaction.options.getUser('user');
        const attachment = interaction.options.getAttachment('attachment');

        const key = `${interaction.user.id}-${Date.now()}`;
        pendingMails.set(key, {
          senderId: interaction.user.id,
          targetId: target.id,
          attachmentUrl: attachment ? attachment.url : null
        });

        const embed = new EmbedBuilder()
          .setColor(0x1b1ec4)
          .setTitle(`${EMJ.logo} New mail`)
          .setDescription(
            `**To:** <@${target.id}>\n` +
            (attachment ? `**Attachment:** ${attachment.name}\n` : '') +
            `\nChoose the type of mail you want to send.\n` +
            `**Normal** for a regular message, **Work** for a professional mail.`
          )
          .setFooter({ text: 'Higher Inspection Mail' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`mail_normal_${key}`).setLabel('Normal').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`mail_work_${key}`).setLabel('Work').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`mail_cancel_${key}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      // ---------- /cleardms ----------
      // ---------- /say (WL only) ----------
      if (interaction.commandName === 'say') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only whitelisted users can use /say.', ephemeral: true });
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const text = interaction.options.getString('message');
        if (!text) return interaction.reply({ content: '❌ Provide a message.', ephemeral: true });
        try {
          await channel.send({ content: text, allowedMentions: { parse: ['users', 'roles', 'everyone'] } });
          return interaction.reply({ content: `✅ Sent to <#${channel.id}>.`, ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: `❌ Could not send: ${err.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'cleardms') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can clear DMs.', ephemeral: true });

        const user = interaction.options.getUser('user');
        await interaction.deferReply({ ephemeral: true });

        let deleted = 0;
        let failed = 0;
        try {
          const dm = await user.createDM();
          let lastId = null;
          // walk through the history in pages of 100
          for (let page = 0; page < 10; page++) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const batch = await dm.messages.fetch(options);
            if (batch.size === 0) break;
            lastId = batch.last().id;
            for (const msg of batch.values()) {
              if (msg.author.id !== client.user.id) continue; // only our own messages
              try {
                await msg.delete();
                deleted++;
                await wait(900); // stay under the rate limit
              } catch { failed++; }
            }
          }
        } catch (err) {
          return interaction.editReply({ content: `❌ Could not open the DM channel: ${err.message}` });
        }

        return interaction.editReply({
          content: `✅ Cleared **${deleted}** bot message(s) in <@${user.id}>'s DMs.` +
            (failed ? ` (${failed} could not be deleted, they are probably too old.)` : '')
        });
      }

      // ---------- /mwadds (HI): register a staff on Milweb ----------
      if (interaction.commandName === 'mwadds') {
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can register staff on Milweb.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const staffId = interaction.options.getString('staff_id').trim();

        const prev = data.mprofiles[user.id] || {};
        data.mprofiles[user.id] = {
          ...prev,
          userId: user.id,
          username: user.username,
          avatar: user.displayAvatarURL({ extension: 'png', size: 256 }),
          staffId,
          logs: prev.logs || [],
          logCounter: prev.logCounter || 0
        };
        saveData(data);
        await dbSaveMProfile(data.mprofiles[user.id]);
        return interaction.reply({
          content: `✅ <@${user.id}> registered on **Milweb** with Staff ID **${staffId}**. Use \`.sinfo ${staffId}\` to view the page, and \`/addminfo\` to complete the profile.`,
          ephemeral: true
        });
      }

      // ---------- /addminfo (owner only): complete a Milweb profile ----------
      if (interaction.commandName === 'addminfo') {
        if (!isWhitelisted)
          return interaction.reply({ content: '❌ Only the owner can edit Milweb profiles.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const p = data.mprofiles[user.id];
        if (!p)
          return interaction.reply({ content: '❌ This user is not registered on Milweb. Run `/mwadds` first.', ephemeral: true });

        const joinDate = interaction.options.getString('join_date');
        const securityRate = interaction.options.getNumber('security_rate');
        const position = interaction.options.getRole('position');
        const status = interaction.options.getString('status');
        const activityRate = interaction.options.getNumber('activity_rate');
        const infractionPast = interaction.options.getInteger('infraction_past');
        const oldStaff = interaction.options.getBoolean('old_staff');
        const roblox = interaction.options.getString('roblox');
        const division = interaction.options.getString('division');
        const note = interaction.options.getString('note');

        await interaction.deferReply({ ephemeral: true });

        if (joinDate !== null) p.joinDate = joinDate;
        if (securityRate !== null) p.securityRate = securityRate;
        if (position) { p.positionRoleId = position.id; p.positionRoleName = position.name; }
        if (status !== null) p.status = status;
        if (activityRate !== null) p.activityRate = activityRate;
        if (infractionPast !== null) p.infractionPast = infractionPast;
        if (oldStaff !== null) p.oldStaff = oldStaff;
        if (roblox !== null && roblox !== p.roblox) { p.roblox = roblox; p.robloxId = await fetchRobloxId(roblox); }
        if (division !== null) p.division = division;
        if (note !== null) p.note = note;
        p.username = user.username;
        p.avatar = user.displayAvatarURL({ extension: 'png', size: 256 });

        saveData(data);
        await dbSaveMProfile(p);
        return interaction.editReply({ content: `✅ Milweb profile of <@${user.id}> (**${p.staffId}**) updated. View it with \`.sinfo ${p.staffId}\`.` });
      }
    }

    // ================= BUTTONS =================
    if (interaction.isButton()) {
      const id = interaction.customId;

      // ----- infraction: REVOKE -----
      let mi = id.match(/^infract_revoke_(\d+)$/);
      if (mi) {
        const caseId = mi[1];
        const inf = data.infractions[caseId];
        if (!inf) return interaction.reply({ content: 'This infraction no longer exists.', ephemeral: true });

        const isWl = config.whitelist.includes(interaction.user.id);
        const canRevoke = isWl || isHIOnly(interaction.member);
        if (!canRevoke) {
          await logInfract(`${INF_EMOJI.trianglealert} <@${interaction.user.id}> (${interaction.user.id}) **tried to revoke** infraction \`${caseId}\` <t:${Math.floor(Date.now() / 1000)}:F>`);
          return interaction.reply({ content: '❌ Only Higher Inspection can revoke an infraction.', ephemeral: true });
        }
        if (inf.revoked) return interaction.reply({ content: 'This infraction is already revoked.', ephemeral: true });

        // answer the interaction right away (ephemeral) so it never times out
        await interaction.deferReply({ ephemeral: true });

        inf.revoked = true;
        inf.revokedBy = interaction.user.id;
        inf.revokedAt = Math.floor(Date.now() / 1000);
        data.infractions[caseId] = inf;
        saveData(data);

        // edit the message -> Revoked (Components V2)
        try {
          await interaction.message.edit(buildInfractionPayload(inf, { withButtons: true }));
        } catch (err) { console.error('revoke edit error:', err.message); }

        // milweb -1 + revoked log
        await milwebInfractionChange(inf.userId, -1, inf.type, caseId, true);

        // DM the user
        try {
          const u = await client.users.fetch(inf.userId);
          const de = new EmbedBuilder()
            .setColor(INFRACT_GREY)
            .setTitle(`${INF_EMOJI.flagoff} Infraction Revoked`)
            .setDescription(`<@${inf.userId}> your infraction (**Case ID ${caseId}**) has been **revoked** by <@${interaction.user.id}>.`)
            .setTimestamp();
          await u.send({ content: `<@${inf.userId}>`, embeds: [de] });
        } catch { /* DMs closed */ }

        await logInfract(`${INF_EMOJI.flagoff} **Infraction revoked** \`${caseId}\` by <@${interaction.user.id}> <t:${inf.revokedAt}:F>`);
        return interaction.editReply({ content: `${INF_EMOJI.usercheck} Done, you revoked the infraction \`${caseId}\`. It has been marked as revoked and the user was notified.` });
      }

      // ----- infraction: CASE (view linked HI case) -----
      mi = id.match(/^infract_case_(\d+)$/);
      if (mi) {
        const caseId = mi[1];
        const inf = data.infractions[caseId];
        if (!inf) return interaction.reply({ content: 'This infraction no longer exists.', ephemeral: true });
        if (!inf.hiCase) return interaction.reply({ content: 'No HI case is linked to this infraction.', ephemeral: true });

        const isWl = config.whitelist.includes(interaction.user.id);
        const isHi = isHIOnly(interaction.member);
        const isInvolved = interaction.user.id === inf.userId;
        // public: anyone can view. private: only HI, WL and the involved user
        const allowed = inf.public ? true : (isWl || isHi || isInvolved);
        if (!allowed) {
          await logInfract(`${INF_EMOJI.trianglealert} <@${interaction.user.id}> (${interaction.user.id}) **tried to view** the case of infraction \`${caseId}\` <t:${Math.floor(Date.now() / 1000)}:F>`);
          return interaction.reply({ content: '❌ You cannot view this case.', ephemeral: true });
        }

        const c = data.cases[inf.hiCase];
        if (!c) return interaction.reply({ content: `The linked case \`${inf.hiCase}\` was not found.`, ephemeral: true });

        await logInfract(`${INF_EMOJI.idcard} <@${interaction.user.id}> viewed the case \`${inf.hiCase}\` (infraction \`${caseId}\`) <t:${Math.floor(Date.now() / 1000)}:F>`);
        return interaction.reply({ embeds: [buildCaseEmbed(c)], ephemeral: true });
      }

      // ----- mail buttons -----
      let m = id.match(/^mail_(normal|work|cancel)_(.+)$/);
      if (m) {
        const [, kind, key] = m;
        const pm = pendingMails.get(key);
        if (!pm) return interaction.reply({ content: 'This mail form has expired. Run `/mail` again.', ephemeral: true });
        if (interaction.user.id !== pm.senderId)
          return interaction.reply({ content: 'This form is not yours.', ephemeral: true });

        if (kind === 'cancel') {
          pendingMails.delete(key);
          return interaction.update({ content: 'Mail cancelled.', embeds: [], components: [] });
        }

        pm.kind = kind;
        const modal = new ModalBuilder()
          .setCustomId(`mail_modal_${kind}_${key}`)
          .setTitle(kind === 'work' ? 'Professional mail' : 'New mail');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('subject').setLabel('Subject (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('image').setLabel('Image or file link (optional)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return interaction.showModal(modal);
      }

      // ----- ZSAR request buttons -----
      m = id.match(/^zsarreq_open_([01])_(\d+)$/);
      if (m) {
        const [, forYou, ownerId] = m;
        if (interaction.user.id !== ownerId)
          return interaction.reply({ content: 'This request panel is not yours. Run `/reqcard` yourself.', ephemeral: true });
        const modal = new ModalBuilder()
          .setCustomId(`zsarreq_modal_${forYou}_${ownerId}`)
          .setTitle('ZSAR Card Request');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('roblox').setLabel('Roblox user').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('letters').setLabel('Access letter(s): A, B, M, L (min. 1)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Reason for wanting this badge').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      m = id.match(/^zsarreq_(accept|deny)_(\d+)$/);
      if (m) {
        const [, action, requesterId] = m;
        if (!isHIOnly(interaction.member))
          return interaction.reply({ content: '❌ Only HI can review ZSAR requests.', ephemeral: true });

        if (action === 'accept') {
          try {
            const u = await client.users.fetch(requesterId);
            await u.send(`<@${requesterId}> ✅ **Your ZSAR badge request has been accepted.** Your badge is on the way, you will receive it shortly.`);
          } catch {}
          await interaction.update({ components: [] });
          return interaction.followUp({
            content: `✅ Request accepted. Now issue the card with:\n\`/addcz user:<@${requesterId}> card:(image) type:(Temporary/Permanent/Visitor) letter:(A/B/M/L)\``,
            ephemeral: true
          });
        }
        if (action === 'deny') {
          try {
            const u = await client.users.fetch(requesterId);
            await u.send(`<@${requesterId}> ❌ **Your ZSAR badge request has been denied.** You may contact HI for more information.`);
          } catch {}
          await interaction.update({ components: [] });
          return interaction.followUp({ content: `Request denied (user notified).`, ephemeral: true });
        }
      }

      // ----- Milweb panel buttons -----
      m = id.match(/^milweb_(ssu|staff|case)_(.+)$/);
      if (m) {
        const [, kind, key] = m;
        const panel = milwebPanels.get(key);
        if (!panel)
          return interaction.reply({ content: 'This Milweb panel has expired Run `.milweb` again', ephemeral: true });
        if (interaction.user.id !== panel.runnerId) {
          if (!panel.warned.has(interaction.user.id)) {
            panel.warned.add(interaction.user.id);
            return interaction.reply({ content: 'This panel is not yours', ephemeral: true });
          }
          return interaction.deferUpdate(); // clicked again: nothing happens
        }
        if (kind === 'ssu') {
          let desc = 'Send SSU Code with `.ssu (number)`\nAdd an SSU record with `.addssu (type) (rate) (abuse) (fulls)`';
          const recent = (data.ssuLogs || []).slice(-5).reverse();
          if (recent.length > 0) {
            desc += '\n\n**Latest SSU records:**\n' + recent.map((s) =>
              `[\`${s.type}\`] <t:${s.at}:d> rate: **${s.rate}** | abuse: **${s.abuse === 'abuyes' ? 'yes' : 'no'}** | fulls: **${s.fulls}** (by ${s.byName})`
            ).join('\n');
          }
          const e = new EmbedBuilder()
            .setColor(0x1f4fbf)
            .setTitle('SSU INFO')
            .setDescription(desc.slice(0, 4000))
            .setFooter({ text: 'Milweb v1 (beta)' });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }
        if (kind === 'staff') {
          const e1 = new EmbedBuilder()
            .setColor(0x1f4fbf)
            .setTitle('STAFF INFO')
            .setDescription('Staff info is only a **preview**')
            .setFooter({ text: 'Milweb v1 (beta)' });
          const e2 = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setDescription('Write `.sinfo (staff number)`\nIf the staff number is registered it will show the record preview otherwise it will show **Not saved**');
          return interaction.reply({ embeds: [e1, e2], ephemeral: true });
        }
        if (kind === 'case') {
          const e = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle('CASE VIEWER')
            .setDescription('EXPERIMENTAL: NOT WORKING (OPD4)')
            .setFooter({ text: 'Milweb v1 (beta)' });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }
      }

      // ----- Dillan panel buttons -----
      m = id.match(/^dillan_(ssu|staff|case|link|logs)_(.+)$/);
      if (m) {
        const [, kind, key] = m;
        const panel = milwebPanels.get(key);
        if (!panel)
          return interaction.reply({ content: 'This Dillan panel has expired. Run `.dillan` again.', ephemeral: true });
        if (interaction.user.id !== panel.runnerId) {
          if (!panel.warned.has(interaction.user.id)) {
            panel.warned.add(interaction.user.id);
            return interaction.reply({ content: 'This panel is not yours.', ephemeral: true });
          }
          return interaction.deferUpdate();
        }

        if (kind === 'ssu') {
          return interaction.reply({ content: 'ssu info is not existing anymore, you can still have information about ssu on milweb.nyuc.app', ephemeral: true });
        }

        if (kind === 'staff') {
          let profiles = [];
          if (supabase) {
            try {
              const { data: rows } = await supabase.from('milweb_profiles').select('user_id, username, staff_id').order('staff_id', { ascending: true });
              profiles = rows || [];
            } catch (e) { console.error('dillan staff supabase error:', e.message); }
          }
          if (profiles.length === 0) profiles = Object.values(data.mprofiles || {}).map((p) => ({ user_id: p.userId, username: p.username, staff_id: p.staffId }));
          const list = profiles.length === 0 ? 'No staff registered yet.'
            : profiles.map((p) => `\`${p.staff_id || '???'}\` - ${p.username || 'Unknown'} (<@${p.user_id}>)`).join('\n').slice(0, 3800);
          const e = new EmbedBuilder()
            .setColor(0x1f4fbf)
            .setTitle(`${EMJ.logo} Dillan - Staff Info`)
            .setDescription(`Use \`.slist\` for the full list and \`.sinfo (number)\` for a profile.\n\n${list}`)
            .setFooter({ text: `${profiles.length} staff | dillan.nyuc.app` });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }

        if (kind === 'case') {
          return interaction.reply({ content: 'Open the case viewer on the web version:\nhttps://dillan.nyuc.app/#/cases', ephemeral: true });
        }

        if (kind === 'link') {
          const e = new EmbedBuilder()
            .setColor(0x1f4fbf)
            .setTitle(`${EMJ.logo} HI Tools - Links`)
            .setDescription(
              '- **Milweb** — https://milweb.nyuc.app\n' +
              '- **Dillan** — https://dillan.nyuc.app\n' +
              '- **MDE** — https://mde.nyuc.app\n' +
              '- **Special** — https://special.nyuc.app'
            )
            .setFooter({ text: 'NYUC Higher Inspection' });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }

        if (kind === 'logs') {
          return interaction.reply({ content: 'Logs are on the web version — **unavailable for now**.', ephemeral: true });
        }
      }

      m = id.match(/^card_(access|pro)_(\d+)$/);
      if (m) {
        const [, kind, agentId] = m;
        const card = data.staffCards[agentId];
        if (!card) return interaction.reply({ content: '❌ Card no longer exists.', ephemeral: true });
        const url = kind === 'access' ? card.accessCardUrl : card.proCardUrl;
        if (!url) return interaction.reply({ content: '❌ Card image not available.', ephemeral: true });
        const e = new EmbedBuilder()
          .setColor(card.dept === 'HI' ? 0x1f4fbf : 0x3498db)
          .setTitle(`${EMJ.logo} ${kind === 'access' ? 'ACCESS CARD (ZSAR)' : 'PROFESSIONAL CARD'} (${card.dept})`)
          .setDescription(`Agent: <@${agentId}>`)
          .setImage(url)
          .setTimestamp();
        return interaction.reply({ embeds: [e] });
      }

      // ----- quest buttons (staff, in quest log channel) -----
      m = id.match(/^quest_(accept|again)_(\d+)$/);
      if (m) {
        const [, action, targetId] = m;
        const staffAccess = hasCaseAccess(interaction.member);
        if (!staffAccess.ok)
          return interaction.reply({ content: '❌ Only HI/IA can review answers.', ephemeral: true });

        const quest = data.activeQuests[targetId];
        if (action === 'accept') {
          const dept = quest ? quest.dept : staffAccess.dept;
          delete data.activeQuests[targetId];
          saveData(data);
          try {
            const user = await client.users.fetch(targetId);
            await user.send(`<@${targetId}> ✅ Thank you for responding. A **${dept}** agent will review it.`);
          } catch {}
          return interaction.update({ components: [] }).then(() =>
            interaction.followUp({ content: `✅ Answer accepted. User notified.`, ephemeral: true })
          );
        }
        if (action === 'again') {
          const modal = new ModalBuilder()
            .setCustomId(`quest_modal_${targetId}`)
            .setTitle('New question');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('question').setLabel('Question').setStyle(TextInputStyle.Paragraph).setRequired(true)
            )
          );
          return interaction.showModal(modal);
        }
      }

      // ----- case buttons -----
      m = id.match(/^case_(go|cancel|ongoing|confirmation|finished)_(.+)$/);
      if (m) {
        const [, action, key] = m;
        const p = pendingCases.get(key);
        if (!p) return interaction.reply({ content: '❌ This case setup expired. Run `/case start` again.', ephemeral: true });
        if (interaction.user.id !== p.creatorId)
          return interaction.reply({ content: '❌ Only the case creator can use these buttons.', ephemeral: true });

        if (action === 'cancel') {
          pendingCases.delete(key);
          return interaction.update({ content: '🗑️ Case creation cancelled.', embeds: [], components: [] });
        }
        if (action === 'go') {
          const modal = new ModalBuilder().setCustomId(`case_modal_${key}`).setTitle(`${p.dept} Case Form`);
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('violations').setLabel('Violations (1 per line, max 3)').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('startdate').setLabel('Start date (mm/dd/yy HH:MM)').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('investigators').setLabel('Investigator(s) (optional)').setStyle(TextInputStyle.Short).setRequired(false))
          );
          return interaction.showModal(modal);
        }
        if (action === 'ongoing') {
          p.status = 'Awaiting'; p.caseType = 'awaiting';
          await interaction.update({ content: '⏳ Creating case (Awaiting sanction)...', components: [] });
          return finalizeCase(interaction, key);
        }
        if (action === 'confirmation') {
          p.status = 'Confirmation Needed'; p.caseType = 'confirmation';
          await interaction.update({ content: '⏳ Creating case (Confirmation needed)...', components: [] });
          return finalizeCase(interaction, key);
        }
        if (action === 'finished') {
          // open the rich sanction form; on submit the case is created + sealed
          p.caseType = 'finished';
          return interaction.showModal(buildSanctionModal(`case_sanction_${key}`, 'Finish case - Sanction'));
        }
      }

      // ----- posted-case buttons: Add Sanction (HI) / Confirm (leadership) -----
      m = id.match(/^case(sanction|confirm)_(.+)$/);
      if (m) {
        const [, kind, number] = m;
        const c = data.cases[number];
        if (!c) return interaction.reply({ content: '❌ Case not found.', ephemeral: true });
        if (c.sealed) return interaction.reply({ content: '❌ This case is already sealed.', ephemeral: true });
        const access = hasCaseAccess(interaction.member);
        if (!access.ok) return interaction.reply({ content: '❌ You need the HI or IA role.', ephemeral: true });
        // Confirm is a leadership action; HI may click it but it gets logged
        return interaction.showModal(buildSanctionModal(
          kind === 'confirm' ? `sanctionconfirm_${number}` : `sanctionapply_${number}`,
          kind === 'confirm' ? 'Leadership confirmation' : 'Add sanction'
        ));
      }
    }

    // ================= MODALS =================
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // mail modal
      let m = id.match(/^mail_modal_(normal|work)_(.+)$/);
      if (m) {
        const [, kind, key] = m;
        const pm = pendingMails.get(key);
        if (!pm) return interaction.reply({ content: 'This mail form has expired.', ephemeral: true });
        pendingMails.delete(key);

        const subject = (interaction.fields.getTextInputValue('subject') || '').trim();
        const body = interaction.fields.getTextInputValue('message');
        const imageLink = (interaction.fields.getTextInputValue('image') || '').trim();
        const sender = interaction.user;
        const isWork = kind === 'work';

        const mail = new EmbedBuilder()
          .setColor(isWork ? 0x1b1ec4 : 0x2f7ff5)
          .setTitle(`${EMJ.logo} ${isWork ? 'HIGHER INSPECTION - PROFESSIONAL MAIL' : 'HIGHER INSPECTION MAIL'}`)
          .setDescription(
            (subject ? `**Subject:** ${subject}\n` : '') +
            (isWork ? `-# This is a professional mail sent for work purposes.\n` : '') +
            `\n${body}\n\n` +
            `-# Sent by ${sender.username} (${sender.id})`
          )
          .addFields({ name: 'Sender', value: `<@${sender.id}>`, inline: true })
          .setThumbnail(sender.displayAvatarURL())
          .setFooter({ text: isWork ? 'NYUC Higher Inspection | Professional mail - do not reply to this message' : 'NYUC Higher Inspection Mail - do not reply to this message' })
          .setTimestamp();

        const picture = pm.attachmentUrl || (/^https?:\/\//i.test(imageLink) ? imageLink : null);
        if (picture) mail.setImage(picture);

        try {
          const target = await client.users.fetch(pm.targetId);
          await target.send({ content: `<@${pm.targetId}>`, embeds: [mail] });
        } catch {
          return interaction.reply({ content: '❌ Could not DM this user (their DMs may be closed).', ephemeral: true });
        }
        return interaction.reply({
          content: `✅ ${isWork ? 'Professional mail' : 'Mail'} sent to <@${pm.targetId}>.`,
          ephemeral: true
        });
      }

      // ZSAR request modal
      m = id.match(/^zsarreq_modal_([01])_(\d+)$/);
      if (m) {
        const [, forYou, requesterId] = m;
        const roblox = interaction.fields.getTextInputValue('roblox').trim();
        const letters = parseLetters(interaction.fields.getTextInputValue('letters'));
        const reason = interaction.fields.getTextInputValue('reason');

        if (letters.length === 0)
          return interaction.reply({ content: '❌ You must choose at least one valid access letter: A, B, M or L. Run the request again.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        const robloxId = await fetchRobloxId(roblox);

        const member = interaction.member;
        const highestRole = member && member.roles.highest && member.roles.highest.id !== interaction.guild.id
          ? `<@&${member.roles.highest.id}>` : 'None';

        const reqEmbed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`${EMJ.logo} ${interaction.user.username} has requested a badge`)
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: 'User', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
            { name: 'For themselves', value: forYou === '1' ? 'Yes' : 'No', inline: true },
            { name: 'On the guild since', value: member && member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` : 'Unknown', inline: true },
            { name: 'Roblox', value: `ID: ${robloxId} / ${roblox}`, inline: true },
            { name: 'Highest role', value: highestRole, inline: true },
            { name: 'Requested letters', value: letters.join(', '), inline: true },
            { name: 'Message', value: reason.slice(0, 1024) }
          )
          .setFooter({ text: 'NYUC ZSAR System' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`zsarreq_accept_${interaction.user.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`zsarreq_deny_${interaction.user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
        );

        try {
          const ch = await client.channels.fetch(data.zsarReqChannelId);
          await ch.send({ embeds: [reqEmbed], components: [row] });
        } catch (err) {
          console.error('❌ ZSAR request post failed:', err.message);
          return interaction.editReply({ content: '❌ Could not send your request (channel issue). Contact HI.' });
        }
        return interaction.editReply({ content: '✅ Your ZSAR card request has been submitted. HI will review it.' });
      }

      // quest again modal
      m = id.match(/^quest_modal_(\d+)$/);
      if (m) {
        const targetId = m[1];
        const question = interaction.fields.getTextInputValue('question');
        const prev = data.activeQuests[targetId];
        const staffAccess = hasCaseAccess(interaction.member);
        const quest = {
          key: `${targetId}-${Date.now()}`,
          dept: prev ? prev.dept : (staffAccess.dept || 'HI'),
          qtype: prev ? prev.qtype : 'question',
          question,
          targetId,
          issuerId: interaction.user.id,
          expiresAt: prev && prev.expiresAt ? Date.now() + (prev.cooldownMs || 86400000) : 0,
          cooldownMs: prev ? prev.cooldownMs : 0
        };
        try { await sendQuestDM(quest); }
        catch { return interaction.reply({ content: '❌ Could not DM the user.', ephemeral: true }); }
        data.activeQuests[targetId] = quest;
        saveData(data);
        return interaction.reply({ content: `✅ New question sent to <@${targetId}>.`, ephemeral: true });
      }

      // case main modal
      m = id.match(/^case_modal_(.+)$/);
      if (m) {
        const key = m[1];
        const p = pendingCases.get(key);
        if (!p) return interaction.reply({ content: '❌ This case setup expired.', ephemeral: true });

        p.reason = interaction.fields.getTextInputValue('reason');
        p.robloxUsername = interaction.fields.getTextInputValue('roblox').trim();
        p.violations = interaction.fields.getTextInputValue('violations')
          .split('\n').map((v) => v.trim()).filter(Boolean).slice(0, 3);
        if (p.violations.length === 0) p.violations = [p.reason];
        p.investigators = (interaction.fields.getTextInputValue('investigators') || '').trim() || null;
        const rawDate = interaction.fields.getTextInputValue('startdate');
        p.startDateUnix = parseUsDate(rawDate);

        await interaction.deferReply({ ephemeral: true });
        p.robloxId = await fetchRobloxId(p.robloxUsername);

        // fast case -> no type choice, straight to the sanction form
        if (p.isFast) {
          p.caseType = 'finished';
          return interaction.editReply({
            content: `✅ Form saved (Roblox: **${p.robloxUsername}**). Click below to add the sanction and seal the fast case.`,
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`case_finished_${key}`).setLabel('Add sanction & seal').setStyle(ButtonStyle.Danger)
            )]
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`case_ongoing_${key}`).setLabel('Awaiting (add sanction later)').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`case_confirmation_${key}`).setLabel('Confirmation needed (ownership)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`case_finished_${key}`).setLabel('Finished (add sanction now)').setStyle(ButtonStyle.Success)
        );
        return interaction.editReply({
          content:
            `✅ Form saved. Roblox: **${p.robloxUsername}** (ID: ${p.robloxId})` +
            (p.startDateUnix ? '' : `\n⚠️ Date "${rawDate}" not recognized. Current time will be used.`) +
            `\nChoose the **case type**:`,
          components: [row]
        });
      }

      // sanction modal at creation (Finished type) -> rich form
      m = id.match(/^case_sanction_(.+)$/);
      if (m) {
        const key = m[1];
        const p = pendingCases.get(key);
        if (!p) return interaction.reply({ content: '❌ This case setup expired.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const s = await readSanctionModal(interaction);
        p.sanction = s.sanction + (s.duration ? ` (${s.duration})` : '');
        p.sanctionReason = s.reason || null;
        p.banned = s.ban;
        if (s.proofImage) p.proofImage = s.proofImage;
        p.status = 'Closed';
        p.caseType = 'finished';
        p.sealedNow = { by: interaction.user.id, byName: interaction.user.username };
        return finalizeCase(interaction, key);
      }

      // ----- Add Sanction / Confirm submit on a posted case -----
      m = id.match(/^sanction(apply|confirm)_(.+)$/);
      if (m) {
        const [, kind, number] = m;
        const c = data.cases[number];
        if (!c) return interaction.reply({ content: '❌ Case not found.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const s = await readSanctionModal(interaction);
        await applyCaseSanction(c, data, {
          sanction: s.sanction, duration: s.duration, reason: s.reason, ban: s.ban, proofImage: s.proofImage,
          byId: interaction.user.id, byName: interaction.user.username,
          isLeadership: kind === 'confirm'
        });
        saveData(data);
        await dbSaveCase(c);

        // optional server ban
        if (c.banned) {
          try { await interaction.guild.members.ban(c.subjectId, { reason: `Case ${number} sanction` }); } catch (e) { console.error('case ban failed:', e.message); }
        }

        // edit the posted case message (new embed, no buttons since sealed)
        try {
          const ch = await client.channels.fetch(c.channelId);
          if (ch && c.messageId) {
            const msg = await ch.messages.fetch(c.messageId).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildCaseEmbed(c)], components: [] });
          }
          // a small separate note for leadership updates
          if (kind === 'confirm' && ch) {
            await ch.send(`${EMJ.stop || '🛡️'} **Leadership has updated the case ${number}.**`);
          }
        } catch (e) { console.error('case edit failed:', e.message); }

        // DM the subject
        try {
          const subject = await client.users.fetch(c.subjectId);
          if (kind === 'confirm') {
            await subject.send({ content: `<@${c.subjectId}>`, embeds: [new EmbedBuilder()
              .setColor(0xe67e22)
              .setTitle(`${EMJ.stop} ${c.dept} CASE UPDATE ${EMJ.logo}`)
              .setDescription(`Ownership has taken a decision regarding your case. The case will soon be updated and made public.\n\n-# Reply \`.case\` here to receive your full case file.`)
              .addFields({ name: 'Case File Number', value: `${number}`, inline: true }, { name: 'Sanction', value: `${c.sanction}`, inline: true })
              .setTimestamp()] });
          } else {
            await subject.send({ content: `<@${c.subjectId}>`, embeds: [new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle(`${EMJ.stop} ${c.dept} CASE FINISHED ${EMJ.logo}`)
              .setDescription(`Your case has been finished. The sanction and details are recorded in your case file.\n\n-# Reply \`.case\` here to receive your full case file.`)
              .addFields({ name: 'Case File Number', value: `${number}`, inline: true }, { name: 'Sanction', value: `${c.sanction}`, inline: true })
              .setTimestamp()] });
          }
        } catch {}

        return interaction.editReply({ content: `✅ Case **${number}** ${kind === 'confirm' ? 'confirmed by leadership' : 'sanctioned'} and sealed. Sanction: **${c.sanction}**.` });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable())
      interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
  }
});

// =====================================================================
//  DMs — ".case" retrieval + quest answers
// =====================================================================
// =====================================================================
//  INFRACTION anti-delete: if someone deletes an infraction message,
//  repost it, log it, and try to identify + warn who deleted it.
// =====================================================================
client.on(Events.MessageDelete, async (message) => {
  try {
    if (!message || !message.id) return;
    // find the infraction whose message was deleted
    const inf = Object.values(data.infractions || {}).find((x) => x.messageId === message.id);
    if (!inf) return;

    // repost the exact same infraction
    let newMsg = null;
    try {
      const ch = await client.channels.fetch(inf.channelId);
      newMsg = await ch.send(buildInfractionPayload(inf, { withButtons: true }));
      inf.messageId = newMsg.id;
      data.infractions[inf.caseId] = inf;
      saveData(data);
    } catch (err) { console.error('infraction repost error:', err.message); }

    // try to find who deleted it (needs View Audit Log permission)
    let deleterId = null;
    try {
      if (message.guild) {
        await wait(1500); // give Discord a moment to write the audit entry
        const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
        const entry = logs.entries.find((e) => e.target && e.target.id === client.user.id);
        if (entry && entry.executor && entry.executor.id !== client.user.id) deleterId = entry.executor.id;
      }
    } catch { /* no permission or nothing found */ }

    // warn the deleter in DM
    if (deleterId) {
      try {
        const u = await client.users.fetch(deleterId);
        await u.send(`<@${deleterId}> ${INF_EMOJI.octagonx} You cannot delete infractions. Only Higher Inspection can delete an infraction. The message has been restored.`);
      } catch { /* DMs closed */ }
    }

    await logInfract(
      `${INF_EMOJI.trianglealert} **Infraction message deleted** \`${inf.caseId}\`` +
      (deleterId ? ` by <@${deleterId}> (${deleterId})` : ' by an unknown user') +
      ` - it has been restored. <t:${Math.floor(Date.now() / 1000)}:F>`
    );
  } catch (err) { console.error('MessageDelete infraction error:', err.message); }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // ===================== GUILD commands: .milweb / .ssu / .sinfo =====================
  if (message.guild) {
    const content = message.content.trim();
    const lower = content.toLowerCase();

    // ----- .infractest : post a sample infraction to test the render -----
    if (lower === '.infractest') {
      if (!isHIOnly(message.member))
        return message.reply(`<@${message.author.id}> only HI can test infractions.`);

      const inf = {
        caseId: genInfractionId(),
        userId: message.author.id,
        userTag: message.author.username,
        type: 'Warning',
        reason: 'This is a test infraction.',
        note: 'Test note - you can safely revoke this.',
        infractType: 'Normal',
        expiration: parseExpiration('5d'),
        proofImage: null, proofLink: null,
        hiCase: null,
        public: true,
        issuedById: message.author.id,
        issuedByTag: message.author.username,
        channelId: message.channel.id,
        messageId: null,
        at: Math.floor(Date.now() / 1000),
        revoked: false, revokedBy: null, revokedAt: null
      };
      const posted = await message.channel.send(buildInfractionPayload(inf, { withButtons: true }));
      inf.messageId = posted.id;
      data.infractions[inf.caseId] = inf;
      saveData(data);
      return;
    }

    const isMilwebCmd =
      lower === '.milweb' || lower === '.dillan' || lower.startsWith('.ssu ') || lower === '.ssu' ||
      lower.startsWith('.sinfo') || lower.startsWith('.lock') || lower.startsWith('.delock') ||
      lower.startsWith('.status') || lower.startsWith('.log ') || lower.startsWith('.addssu') ||
      lower === '.slist';
    if (!isMilwebCmd) return;

    if (!isHIOnly(message.member)) {
      return message.reply(`<@${message.author.id}> you are not authorized to use Milweb only HI can (and IA soon)`);
    }

    // ----- .milweb : farewell message -----
    if (lower === '.milweb') {
      const farewell =
        '```\n' +
        '======================================\n' +
        '*************  FAREWELL  *************\n' +
        '\n' +
        '   MILWEB HAS MOVED ON WEB ONLY.\n' +
        '   THE NEW HI STAFF TOOL IS NOW\n' +
        '   CALLED DILLAN - RUN .DILLAN\n' +
        '\n' +
        '        milord-web is alive\n' +
        '\n' +
        '    THANK YOU FOR USING MILWEB' +
        '\n' +
        '\n' +
        '**************************************\n' +
        '```';
      const embed = new EmbedBuilder()
        .setColor(0x1f4fbf)
        .setTitle(`${EMJ.logo} Milweb - Farewell`)
        .setDescription(
          farewell + '\n' +
          'The new tool is here: **milweb.nyuc.app**\n' +
          '-# Run `.dillan` for the new staff tool.'
        )
        .setFooter({ text: 'Milweb -> Dillan' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ----- .dillan : the new staff panel (Components V2) -----
    if (lower === '.dillan') {
      const highest = message.member.roles.highest && message.member.roles.highest.id !== message.guild.id
        ? `<@&${message.member.roles.highest.id}>` : 'No role';

      const key = `${message.author.id}-${Date.now()}`;
      milwebPanels.set(key, { runnerId: message.author.id, warned: new Set() });

      const container = new ContainerBuilder()
        .setAccentColor(0x1f4fbf)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## ${EMJ.logo} Dillan  -# previously Milweb\n**\`v2\`**  welcome to dillan v2`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `-# get access to staff info and case info. use web version: **dillan.nyuc.app**\nRunned as <@${message.author.id}> (${highest})`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**SSU INFO** — Delete\n**STAFF INFO** — Access: Authorized\n**CASE VIEWER** — Access: Authorized\n**LINK** — HI tools\n**LOGS** — on web`))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dillan_ssu_${key}`).setLabel('SSU INFO').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`dillan_staff_${key}`).setLabel('STAFF INFO').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`dillan_case_${key}`).setLabel('CASE VIEWER').setStyle(ButtonStyle.Secondary)
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dillan_link_${key}`).setLabel('LINK').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`dillan_logs_${key}`).setLabel('LOGS').setStyle(ButtonStyle.Secondary)
          )
        );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }


    // ----- .ssu (number) -----
    if (lower.startsWith('.ssu')) {
      const num = content.slice(4).trim();
      if (!num) return message.reply('Usage: `.ssu (number)`');
      const e = new EmbedBuilder()
        .setColor(0x1f4fbf)
        .setTitle('SSU CODE RECEIVED')
        .setDescription(`SSU Code: **${num}**\nNote for folded end SSU info`)
        .setFooter({ text: 'Milweb v1 (beta)' })
        .setTimestamp();
      return message.reply({ embeds: [e] });
    }

    // ----- .sinfo (staff number): full Milweb page -----
    if (lower.startsWith('.sinfo')) {
      const sid = content.slice(6).trim();
      if (!sid) return message.reply('Usage: `.sinfo (staff number)`');

      // Milweb profile first (read from Supabase so website changes show here)
      const mp = await getProfile(sid);
      if (mp) {
        const embed = await buildMProfileEmbed(mp);
        return message.reply({
          content: '-# 🌐 MilWeb is now on the web too: **milweb.nyuc.app** (full experience).',
          embeds: [embed]
        });
      }

      // Fallback: old srecord preview
      const rec = Object.values(data.srecords).find((r) => (r.staffId || '').toLowerCase() === sid.toLowerCase());
      if (!rec) {
        const e = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('STAFF INFO')
          .setDescription(`Staff number **${sid}**: **Not saved**`)
          .setFooter({ text: 'Milweb v1 (beta)' });
        return message.reply({ embeds: [e] });
      }
      const e = new EmbedBuilder()
        .setColor(0x1f4fbf)
        .setTitle('STAFF INFO (preview)')
        .setDescription(`Preview of staff record **${rec.staffId}**\nUse \`/srecord\` for the full record`)
        .addFields(
          { name: 'Discord', value: `<@${rec.userId}>`, inline: true },
          { name: 'Staff ID', value: rec.staffId || 'N/A', inline: true },
          { name: 'Position', value: rec.positionRoleId ? `<@&${rec.positionRoleId}>` : 'N/A', inline: true },
          { name: 'Status', value: SREC_STATUS_LABEL[rec.status] || rec.status || 'N/A', inline: true }
        )
        .setFooter({ text: 'Connect to Milweb (NYUC) & Srecord' })
        .setTimestamp();
      return message.reply({ embeds: [e] });
    }

    // ----- .lock (staff id) -----
    if (lower.startsWith('.lock')) {
      const sid = content.slice(5).trim();
      if (!sid) return message.reply('Usage: `.lock (staff id)`');
      const p = await getProfile(sid);
      if (!p) return message.reply(`❌ No Milweb profile found for **${sid}**.`);
      const lockName = (data.staffCards[message.author.id] && data.staffCards[message.author.id].inspectionId) || message.author.username;
      await pushProfileChange(p.userId, { locked: true, locked_by: lockName });
      if (data.mprofiles[p.userId]) { data.mprofiles[p.userId].locked = true; data.mprofiles[p.userId].lockedBy = lockName; saveData(data); }
      return message.reply(`${EMJ.stop} Profile **${p.staffId}** is now locked. Milweb will show: *this profile is locked by ${lockName}*.`);
    }

    // ----- .delock (staff id) -----
    if (lower.startsWith('.delock')) {
      const sid = content.slice(7).trim();
      if (!sid) return message.reply('Usage: `.delock (staff id)`');
      const p = await getProfile(sid);
      if (!p) return message.reply(`❌ No Milweb profile found for **${sid}**.`);
      await pushProfileChange(p.userId, { locked: false, locked_by: null });
      if (data.mprofiles[p.userId]) { data.mprofiles[p.userId].locked = false; data.mprofiles[p.userId].lockedBy = null; saveData(data); }
      return message.reply(`🔓 Profile **${p.staffId}** is now unlocked.`);
    }

    // ----- .status (staff id) (status) -----
    if (lower.startsWith('.status')) {
      const args = content.slice(7).trim().split(/\s+/);
      const [sid, st] = args;
      const valid = ['susp', 'retired', 'active', 'inactive', 'loa'];
      if (!sid || !st || !valid.includes(st.toLowerCase()))
        return message.reply('Usage: `.status (staff id) (susp / retired / active / inactive / loa)`');
      const p = await getProfile(sid);
      if (!p) return message.reply(`❌ No Milweb profile found for **${sid}**.`);
      const newStatus = st.toLowerCase();
      await pushProfileChange(p.userId, { status: newStatus });
      if (data.mprofiles[p.userId]) { data.mprofiles[p.userId].status = newStatus; saveData(data); }
      return message.reply(`✅ Status of **${p.staffId}** set to **${MSTATUS_LABEL[newStatus] || newStatus}**.`);
    }

    // ----- .log (staff id) (type) (text...) -----
    if (lower.startsWith('.log ')) {
      const args = content.slice(4).trim().split(/\s+/);
      const sid = args.shift();
      const type = (args.shift() || '').toLowerCase();
      const text = args.join(' ');
      const validTypes = ['infraction', 'note', 'warn'];
      if (!sid || !validTypes.includes(type) || !text)
        return message.reply('Usage: `.log (staff id) (infraction / note / warn) (text)`');
      const p = await getProfile(sid);
      if (!p) return message.reply(`❌ No Milweb profile found for **${sid}**.`);
      if (p.locked)
        return message.reply(`${EMJ.stop} This profile is **locked by ${p.lockedBy}**. No logs can be added. Use \`.delock ${p.staffId}\` first.`);

      const log = {
        id: await nextLogIdDb(p.userId, data.mprofiles[p.userId]),
        type,
        text,
        by: message.author.id,
        byName: message.author.username,
        at: Math.floor(Date.now() / 1000)
      };
      // save to Supabase (so Milweb sees it) and to the local file
      await dbSaveMLog(p.userId, log);
      if (data.mprofiles[p.userId]) {
        data.mprofiles[p.userId].logs = data.mprofiles[p.userId].logs || [];
        data.mprofiles[p.userId].logs.push(log);
        saveData(data);
      }
      return message.reply(`✅ Log **${log.id}** (${type}) added to **${p.staffId}** by ${message.author.username}. It is now visible on Milweb.`);
    }

    // ----- .slist : list all staff (user + staff id) -----
    if (lower === '.slist') {
      let profiles = [];
      if (supabase) {
        try {
          const { data: rows } = await supabase.from('milweb_profiles').select('user_id, username, staff_id').order('staff_id', { ascending: true });
          profiles = rows || [];
        } catch (e) { console.error('slist supabase error:', e.message); }
      }
      if (profiles.length === 0) profiles = Object.values(data.mprofiles || {}).map((p) => ({ user_id: p.userId, username: p.username, staff_id: p.staffId }));

      if (profiles.length === 0) return message.reply('No staff registered on MilWeb yet.');

      // build the list (split into chunks so we never hit the 4096 char limit)
      const lines = profiles.map((p) => `\`${p.staff_id || '???'}\` - ${p.username || 'Unknown'} (<@${p.user_id}>)`);
      const chunks = [];
      let buf = '';
      for (const line of lines) {
        if ((buf + line + '\n').length > 3900) { chunks.push(buf); buf = ''; }
        buf += line + '\n';
      }
      if (buf) chunks.push(buf);

      for (let i = 0; i < chunks.length; i++) {
        const e = new EmbedBuilder()
          .setColor(0x1d4ed8)
          .setTitle(`${EMJ.logo} MilWeb Staff List${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`)
          .setDescription(chunks[i])
          .setFooter({ text: `${profiles.length} staff | milweb.nyuc.app` });
        if (i === 0) await message.reply({ content: '-# :emoji full list also on milweb.nyuc.app', embeds: [e] });
        else await message.channel.send({ embeds: [e] });
      }
      return;
    }

    // ----- .addssu (type) (rate) (abuse) (fulls) -----
    if (lower.startsWith('.addssu')) {
      const args = content.slice(7).trim().split(/\s+/).map((a) => a.toLowerCase());
      const [type, rate, abuse, fulls] = args;
      const validRate = ['good', 'middle', 'bad'];
      const validAbuse = ['abuyes', 'abuno'];
      const validFulls = ['full', 'near', 'no'];
      if (!type || !validRate.includes(rate) || !validAbuse.includes(abuse) || !validFulls.includes(fulls))
        return message.reply('Usage: `.addssu (type e.g. adssu) (good / middle / bad) (abuyes / abuno) (full / near / no)`');

      // get a readable ssu number (ssu-001) from supabase, fallback to local count
      var ssuNumber = 'ssu-' + String(data.ssuLogs.length + 1).padStart(3, '0');
      if (supabase) {
        try {
          const { data: cnt } = await supabase.from('milweb_counters').select('value').eq('key', 'ssu').maybeSingle();
          const nn = (cnt ? cnt.value : 0) + 1;
          await supabase.from('milweb_counters').upsert({ key: 'ssu', value: nn });
          ssuNumber = 'ssu-' + String(nn).padStart(3, '0');
        } catch (e) { console.error('ssu number error:', e.message); }
      }
      const s = {
        number: ssuNumber,
        type: type.toUpperCase(),
        rate,
        abuse,
        fulls,
        by: message.author.id,
        byName: message.author.username,
        at: Math.floor(Date.now() / 1000)
      };
      data.ssuLogs.push(s);
      if (data.ssuLogs.length > 100) data.ssuLogs = data.ssuLogs.slice(-100);
      saveData(data);
      await dbSaveSSU(s);

      const e = new EmbedBuilder()
        .setColor(rate === 'good' ? 0x2ecc71 : rate === 'middle' ? 0xf1c40f : 0xff2b2b)
        .setTitle(`${EMJ.logo} SSU RECORDED (${s.number || s.type})`)
        .addFields(
          { name: 'SSU rate', value: rate.charAt(0).toUpperCase() + rate.slice(1), inline: true },
          { name: 'Abuse', value: abuse === 'abuyes' ? 'Yes' : 'No', inline: true },
          { name: 'Fulls', value: fulls.charAt(0).toUpperCase() + fulls.slice(1), inline: true },
          { name: 'Recorded by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Date', value: `<t:${s.at}:f>`, inline: true }
        )
        .setFooter({ text: 'Milweb v1 (beta) | NYUC SSU System' })
        .setTimestamp();
      return message.reply({ embeds: [e] });
    }
    return;
  }
  // ===================== DMs below =====================

  // Fortress blocks DM commands (mode 1+) so the bot stays focused on security
  if (fortress && fortress.getState().active) return;

  // .case — send most recent public case
  if (message.content.trim().toLowerCase() === '.case') {
    const userCases = Object.values(data.cases)
      .filter((c) => c.subjectId === message.author.id && c.public)
      .sort((a, b) => b.dateSubmitted - a.dateSubmitted);
    if (userCases.length === 0) return message.reply('No public case is available for you.');
    return message.reply({ embeds: [buildCaseEmbed(userCases[0])] });
  }

  // Quest answer
  const quest = data.activeQuests[message.author.id];
  if (!quest) return;

  if (quest.expiresAt && Date.now() > quest.expiresAt) {
    delete data.activeQuests[message.author.id];
    saveData(data);
    return message.reply('⌛ This question has **expired**. Your answer was not recorded.');
  }

  const answer = message.content || '*<attachment>*';
  await dbSaveQuestResponse(quest, answer);

  // Log to quest log channel with staff buttons
  if (data.questLogChannelId) {
    try {
      const ch = await client.channels.fetch(data.questLogChannelId);
      const e = new EmbedBuilder()
        .setColor(quest.dept === 'HI' ? 0x1f4fbf : 0x3498db)
        .setTitle(`${EMJ.logo} Quest answer: ${quest.dept} (${quest.qtype})`)
        .addFields(
          { name: 'User', value: `<@${quest.targetId}> (\`${quest.targetId}\`)` },
          { name: 'Question', value: quest.question.slice(0, 1024) },
          { name: 'Answer', value: answer.slice(0, 1024) },
          { name: 'Asked by', value: `<@${quest.issuerId}>` }
        )
        .setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_accept_${quest.targetId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`quest_again_${quest.targetId}`).setLabel('Quest again').setStyle(ButtonStyle.Primary)
      );
      await ch.send({ embeds: [e], components: [row] });
    } catch (err) { console.error('❌ Quest log failed:', err.message); }
  }

  return message.reply('✅ Your answer has been **automatically recorded**.');
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

// ---------------------------------------------------------------------
//  Login with connection diagnostics
// ---------------------------------------------------------------------
client.on('error', (e) => console.error('CLIENT ERROR:', e.message));
client.on('shardError', (e) => console.error('SHARD ERROR:', e.message));
client.rest.on('rateLimited', (info) => console.warn('RATE LIMITED:', JSON.stringify(info)));

const watchdog = setTimeout(() => {
  console.error('⏱️ Still not connected to Discord after 60s.');
  console.error('→ Most likely: host network issue or Discord rate-limit on this server IP.');
  console.error('→ Wait 20-30 min WITHOUT restarting, or contact the host.');
}, 60000);

// ---------------------------------------------------------------------
//  Fortress security system -- TEMPORARILY DISABLED
//  (re-enable by uncommenting the block below and adding fortress.js)
// ---------------------------------------------------------------------
// try {
//   fortress = require('./fortress')({
//     client, config, EMJ, wait, isHIOnly, applyPresence,
//     getData: () => data,
//     saveData: (d) => saveData(d)
//   });
// } catch (err) {
//   console.error('⚠️ Fortress failed to init:', err.message);
// }

client.login(config.token)
  .then(() => clearTimeout(watchdog))
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('❌ LOGIN FAILED:', err.message);
  });

// ---------------------------------------------------------------------
//  Linked Roles web server (see linkedroles.js)
// ---------------------------------------------------------------------
try {
  require('./linkedroles').start();
} catch (err) {
  console.error('⚠️ Linked Roles server failed to start:', err.message);
}
