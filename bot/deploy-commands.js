// =====================================================================
//  Registers slash commands. Run once (and again after any change):
//      set Main File to deploy-commands.js, start, then set back to index.js
// =====================================================================

const {
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const config = require('./config.json');

const commands = [
  // /alertset
  new SlashCommandBuilder()
    .setName('alertset')
    .setDescription('Set the anti-raid alert channel.')
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Channel for alerts').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) => o.setName('code').setDescription('Security code').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /tset
  new SlashCommandBuilder()
    .setName('tset')
    .setDescription('Configure channels and staff roles.')
    .addStringOption((o) =>
      o
        .setName('setting')
        .setDescription('Which setting to change')
        .setRequired(true)
        .addChoices(
          { name: 'Telex IA channel', value: 'telex_ia' },
          { name: 'Telex HI channel', value: 'telex_hi' },
          { name: 'Announce staff channel', value: 'announce_staff' },
          { name: 'Anti-raid alert channel', value: 'alert' },
          { name: 'Quest log channel', value: 'quest_log' },
          { name: 'Seal log channel', value: 'seal_log' },
          { name: 'Case log channel', value: 'case_log' },
          { name: 'ZSAR request channel', value: 'zsar_req' },
          { name: 'Infraction channel', value: 'infract_channel' },
          { name: 'Infraction log channel', value: 'infract_log' },
          { name: 'Staff team role', value: 'staff_role' },
          { name: 'HI role', value: 'hi_role' },
          { name: 'IA role', value: 'ia_role' },
          { name: 'Quarantine role', value: 'quarantine_role' },
          { name: 'Under-investigation role', value: 'investigation_role' },
          { name: 'Fortress: lock channel (toggle)', value: 'fortress_lock' },
          { name: 'Fortress: isolate channel (toggle)', value: 'fortress_isolate' },
          { name: 'Fortress: watch bot (put ID in text field)', value: 'watch_bot' },
          { name: 'Bot status (online/idle/dnd...)', value: 'bot_status' },
          { name: 'Bot activity (playing/listening...)', value: 'bot_activity' }
        ))
    .addStringOption((o) => o.setName('code').setDescription('Security code').setRequired(true))
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Target channel (for channel settings)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addRoleOption((o) =>
      o.setName('role').setDescription('Target role (for HI/IA role settings)').setRequired(false))
    .addStringOption((o) =>
      o.setName('status').setDescription('Bot status (for bot_status setting)').setRequired(false)
        .addChoices(
          { name: 'Online', value: 'online' },
          { name: 'Idle (away)', value: 'idle' },
          { name: 'Do Not Disturb', value: 'dnd' },
          { name: 'Invisible (offline)', value: 'invisible' }
        ))
    .addStringOption((o) =>
      o.setName('activity_type').setDescription('Activity type (for bot_activity setting)').setRequired(false)
        .addChoices(
          { name: 'Playing', value: 'playing' },
          { name: 'Listening to', value: 'listening' },
          { name: 'Watching', value: 'watching' },
          { name: 'Competing in', value: 'competing' },
          { name: 'Custom (text only)', value: 'custom' }
        ))
    .addStringOption((o) =>
      o.setName('text').setDescription('Custom activity message (for bot_activity setting)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /telex
  new SlashCommandBuilder()
    .setName('telex')
    .setDescription('Send a telex / telegram message.')
    .addStringOption((o) =>
      o
        .setName('dest')
        .setDescription('Destination')
        .setRequired(true)
        .addChoices(
          { name: 'IA', value: 'ia' },
          { name: 'HI', value: 'hi' },
          { name: 'IA and HI', value: 'ia_hi' },
          { name: 'All', value: 'all' },
          { name: 'Announce (staff)', value: 'announce' }
        ))
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Telex type / format')
        .setRequired(true)
        .addChoices(
          { name: 'Raid alert', value: 'raid_alert' },
          { name: 'Announce', value: 'announce' },
          { name: 'Warning', value: 'warning' },
          { name: 'Blacklist', value: 'blacklist' },
          { name: 'Case', value: 'case' }
        ))
    .addStringOption((o) => o.setName('message').setDescription('The message body').setRequired(true))
    .addRoleOption((o) => o.setName('ping').setDescription('Optional role to ping').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /case
  new SlashCommandBuilder()
    .setName('case')
    .setDescription('HI / IA investigation cases.')
    .addSubcommand((sc) =>
      sc
        .setName('start')
        .setDescription('Start a new investigation case.')
        .addUserOption((o) => o.setName('user').setDescription('Subject of the investigation').setRequired(true))
        .addStringOption((o) =>
          o.setName('type').setDescription('Force case type (default: based on your role)').setRequired(false)
            .addChoices({ name: 'HI', value: 'HI' }, { name: 'IA', value: 'IA' }))
        .addBooleanOption((o) => o.setName('public').setDescription('Subject can retrieve the case with .case in DM').setRequired(false))
        .addAttachmentOption((o) => o.setName('proof').setDescription('Proof image (optional)').setRequired(false))
        .addStringOption((o) => o.setName('proof_link').setDescription('Proof link(s) (optional)').setRequired(false)))
    .addSubcommand((sc) =>
      sc
        .setName('view')
        .setDescription('View a case by its number.')
        .addStringOption((o) => o.setName('number').setDescription('e.g. HI-2026-0001').setRequired(true)))
    .toJSON(),

  // /fastcase
  new SlashCommandBuilder()
    .setName('fastcase')
    .setDescription('Create a direct case (Management and below only).')
    .addUserOption((o) => o.setName('user').setDescription('Subject of the case').setRequired(true))
    .addBooleanOption((o) => o.setName('public').setDescription('Subject can retrieve the case with .case in DM').setRequired(false))
    .addAttachmentOption((o) => o.setName('proof').setDescription('Proof image (optional)').setRequired(false))
    .addStringOption((o) => o.setName('proof_link').setDescription('Proof link(s) (optional)').setRequired(false))
    .toJSON(),

  // /quest
  new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Send an official question to a user in DM.')
    .addUserOption((o) => o.setName('user').setDescription('User to question').setRequired(true))
    .addStringOption((o) =>
      o.setName('type').setDescription('Question type').setRequired(true)
        .addChoices(
          { name: 'Question', value: 'question' },
          { name: 'Wtn Question (witness)', value: 'witness' },
          { name: 'Infract. Question', value: 'infract' }
        ))
    .addStringOption((o) => o.setName('question').setDescription('The question to send').setRequired(true))
    .addStringOption((o) =>
      o.setName('cooldown').setDescription('Time before the question expires').setRequired(true)
        .addChoices(
          { name: '1 hour', value: 'h1' },
          { name: '12 hours', value: 'h12' },
          { name: '24 hours', value: 'h24' },
          { name: 'Infinite', value: 'inf' }
        ))
    .toJSON(),

  // /seal
  new SlashCommandBuilder()
    .setName('seal')
    .setDescription('Seal or lock a channel for an investigation.')
    .addStringOption((o) =>
      o.setName('type').setDescription('Seal type').setRequired(true)
        .addChoices(
          { name: 'Logs Seal', value: 'logs_seal' },
          { name: 'Chat Seal', value: 'chat_seal' },
          { name: 'Seal', value: 'seal' },
          { name: 'Locked', value: 'locked' }
        ))
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Channel to seal').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addIntegerOption((o) =>
      o.setName('m_log').setDescription('Number of messages to record to the seal log (max 50)').setMinValue(1).setMaxValue(50).setRequired(false))
    .addStringOption((o) => o.setName('note').setDescription('Optional note shown on the seal').setRequired(false))
    .addBooleanOption((o) => o.setName('user').setDescription('Show who sealed it (small, at the bottom)').setRequired(false))
    .toJSON(),

  // /sealr
  new SlashCommandBuilder()
    .setName('sealr')
    .setDescription('Remove a seal / lock from a channel.')
    .addStringOption((o) =>
      o.setName('msg').setDescription('Removal reason').setRequired(true)
        .addChoices(
          { name: 'Collected', value: 'collected' },
          { name: 'Removed', value: 'removed' },
          { name: 'Deleted', value: 'deleted' }
        ))
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Channel to unseal').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) =>
      o.setName('kind').setDescription('Was it a seal or a lock? (default: seal)').setRequired(false)
        .addChoices({ name: 'Seal', value: 'seal' }, { name: 'Lock', value: 'lock' }))
    .toJSON(),

  // /addcard
  new SlashCommandBuilder()
    .setName('addcard')
    .setDescription('Create or update an HI/IA agent card.')
    .addUserOption((o) => o.setName('user').setDescription('Agent').setRequired(true))
    .addStringOption((o) =>
      o.setName('type').setDescription('Department').setRequired(true)
        .addChoices({ name: 'HI', value: 'HI' }, { name: 'IA', value: 'IA' }))
    .addRoleOption((o) => o.setName('role').setDescription('Agent role').setRequired(true))
    .addStringOption((o) =>
      o.setName('status').setDescription('Agent status').setRequired(true)
        .addChoices(
          { name: 'Active', value: 'active' },
          { name: 'Undercover', value: 'undercover' },
          { name: 'Under investigation', value: 'underinv' },
          { name: 'None', value: 'none' }
        ))
    .addStringOption((o) =>
      o.setName('typeid').setDescription('Type of agent ID (default: Permanent)').setRequired(false)
        .addChoices(
          { name: 'Permanent Agent', value: 'permanent' },
          { name: 'Temporary Agent', value: 'temporary' },
          { name: 'Agent Leader', value: 'leader' },
          { name: 'Trial Agent', value: 'trial' },
          { name: 'Contributor Agent', value: 'contributor' }
        ))
    .addStringOption((o) => o.setName('roblox').setDescription('Roblox username / system ID (optional)').setRequired(false))
    .addStringOption((o) => o.setName('since').setDescription('HI/IA since (e.g. 03/12/25) (optional)').setRequired(false))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID (optional)').setRequired(false))
    .addStringOption((o) => o.setName('inspection_id').setDescription('Inspection ID (optional)').setRequired(false))
    .addAttachmentOption((o) => o.setName('access_card').setDescription('ZSAR access card image (optional)').setRequired(false))
    .addAttachmentOption((o) => o.setName('pro_card').setDescription('Professional card image (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /delcard
  new SlashCommandBuilder()
    .setName('delcard')
    .setDescription('Remove an HI/IA agent card.')
    .addUserOption((o) => o.setName('user').setDescription('Agent to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /showcid
  new SlashCommandBuilder()
    .setName('showcid')
    .setDescription('Show your official HI/IA identification to a user (sent in their DM).')
    .addUserOption((o) => o.setName('user').setDescription('Who to show your ID to').setRequired(true))
    .toJSON(),

  // /srecord
  new SlashCommandBuilder()
    .setName('srecord')
    .setDescription('View a staff record (HI only).')
    .addUserOption((o) => o.setName('user').setDescription('Staff member (or use staff_id)').setRequired(false))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID (or use user)').setRequired(false))
    .toJSON(),

  // /addsrec
  new SlashCommandBuilder()
    .setName('addsrec')
    .setDescription('Create or update a staff record (owner only).')
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID').setRequired(true))
    .addRoleOption((o) => o.setName('position').setDescription('Position (role)').setRequired(true))
    .addStringOption((o) => o.setName('staff_join_date').setDescription('Staff join date (e.g. 03/12/25)').setRequired(true))
    .addBooleanOption((o) => o.setName('was_inspection').setDescription('Has been Inspection').setRequired(true))
    .addStringOption((o) =>
      o.setName('status').setDescription('Staff status').setRequired(true)
        .addChoices(
          { name: 'Valid', value: 'valid' },
          { name: 'Active', value: 'active' },
          { name: 'Suspended', value: 'suspended' },
          { name: 'Blacklisted', value: 'blacklisted' },
          { name: 'Under investigation', value: 'under_investigation' },
          { name: 'D/R', value: 'dr' },
          { name: 'Retired', value: 'retired' }
        ))
    .addStringOption((o) => o.setName('old_matricule').setDescription('Old matricule (optional)').setRequired(false))
    .addStringOption((o) => o.setName('roblox').setDescription('Roblox username (ID auto-fetched) (optional)').setRequired(false))
    .addNumberOption((o) => o.setName('staff_rate').setDescription('Staff rate /10 (optional)').setMinValue(0).setMaxValue(10).setRequired(false))
    .addBooleanOption((o) => o.setName('acceptance').setDescription('Acceptance (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /addslogs
  new SlashCommandBuilder()
    .setName('addslogs')
    .setDescription('Add a log to a staff record (HI only).')
    .addStringOption((o) =>
      o.setName('type').setDescription('Log type').setRequired(true)
        .addChoices(
          { name: 'Warning', value: 'Warning' },
          { name: 'Blacklist', value: 'Blacklist' },
          { name: 'Termination', value: 'Termination' },
          { name: 'Note', value: 'Note' },
          { name: 'Control', value: 'Control' },
          { name: 'Suspension', value: 'Suspension' },
          { name: 'Rate', value: 'Rate' },
          { name: 'Verification', value: 'Verification' },
          { name: 'Infraction', value: 'Infraction' },
          { name: 'BDE', value: 'BDE' }
        ))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Staff member (or use staff_id)').setRequired(false))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID (or use user)').setRequired(false))
    .addStringOption((o) => o.setName('message').setDescription('Additional message (optional)').setRequired(false))
    .toJSON(),

  // /lockprs
  new SlashCommandBuilder()
    .setName('lockprs')
    .setDescription('Lock/unlock a staff profile (HI only, re-run to unlock).')
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .toJSON(),

  // /deltels
  new SlashCommandBuilder()
    .setName('deltels')
    .setDescription('Delete a log from a staff record (HI only).')
    .addStringOption((o) => o.setName('log_id').setDescription('Log ID (e.g. L-0001)').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Staff member (or use staff_id)').setRequired(false))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID (or use user)').setRequired(false))
    .toJSON(),

  // /reqcard
  new SlashCommandBuilder()
    .setName('reqcard')
    .setDescription('Request a ZSAR card (staff team).')
    .addBooleanOption((o) => o.setName('for_you').setDescription('Is this request for yourself?').setRequired(true))
    .toJSON(),

  // /addcz
  new SlashCommandBuilder()
    .setName('addcz')
    .setDescription('Issue a ZSAR card to a user (HI only).')
    .addUserOption((o) => o.setName('user').setDescription('Card holder').setRequired(true))
    .addAttachmentOption((o) => o.setName('card').setDescription('Card image (png)').setRequired(true))
    .addStringOption((o) =>
      o.setName('type').setDescription('Card type').setRequired(true)
        .addChoices(
          { name: 'Temporary (auto-deactivates in 24h)', value: 'temporary' },
          { name: 'Permanent', value: 'permanent' },
          { name: 'Visitor', value: 'visitor' }
        ))
    .addStringOption((o) => o.setName('letter').setDescription('Access letter(s): A, B, M, L (required for Permanent, e.g. "A,B")').setRequired(false))
    .toJSON(),

  // /showzsar
  new SlashCommandBuilder()
    .setName('showzsar')
    .setDescription('Show your ZSAR card to a user (sent in their DM).')
    .addUserOption((o) => o.setName('user').setDescription('Who to show your card to').setRequired(true))
    .toJSON(),

  // /addzsi
  new SlashCommandBuilder()
    .setName('addzsi')
    .setDescription('Issue a supervising ZSAR card (HI/IA) (owner only).')
    .addUserOption((o) => o.setName('user').setDescription('Card holder').setRequired(true))
    .addAttachmentOption((o) => o.setName('card').setDescription('Card image (png)').setRequired(true))
    .addStringOption((o) =>
      o.setName('type').setDescription('Department').setRequired(true)
        .addChoices({ name: 'HI', value: 'hi' }, { name: 'IA', value: 'ia' }))
    .addBooleanOption((o) => o.setName('notify').setDescription('Notify the user in DM?').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /delzsar
  new SlashCommandBuilder()
    .setName('delzsar')
    .setDescription('Remove a ZSAR card (owner only).')
    .addUserOption((o) => o.setName('user').setDescription('Card holder').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /showcidhere
  new SlashCommandBuilder()
    .setName('showcidhere')
    .setDescription('Show your HI/IA identification in this channel.')
    .addStringOption((o) =>
      o.setName('cooldown').setDescription('The card message is deleted after this time').setRequired(true)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: '5 minutes', value: 'm5' },
          { name: '15 minutes', value: 'm15' },
          { name: '30 minutes', value: 'm30' },
          { name: '1 hour', value: 'h1' },
          { name: '24 hours', value: 'h24' },
          { name: 'Never expire', value: 'never' }
        ))
    .toJSON(),

  // /repincom
  new SlashCommandBuilder()
    .setName('repincom')
    .setDescription('Notify a user in DM that they have been reported (HI/IA).')
    .addUserOption((o) => o.setName('user').setDescription('Reported user').setRequired(true))
    .addStringOption((o) => o.setName('report_id').setDescription('Report ID').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('Message to include').setRequired(true))
    .toJSON(),

  // /auth
  new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Log in to Milweb with the code shown on the website (HI only).')
    .addStringOption((o) => o.setName('code').setDescription('The login code from the Milweb page').setRequired(true))
    .toJSON(),

  // /removebde
  new SlashCommandBuilder()
    .setName('removebde')
    .setDescription('Remove a user\'s Milweb access (owner only).')
    .addUserOption((o) => o.setName('user').setDescription('User to disconnect').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /crdauth
  new SlashCommandBuilder()
    .setName('crdauth')
    .setDescription('Log in to CRD with the code shown on the website.')
    .addStringOption((o) => o.setName('code').setDescription('The login code from the CRD page').setRequired(true))
    .toJSON(),

  // /crdaccess
  new SlashCommandBuilder()
    .setName('crdaccess')
    .setDescription('Manage who can log in to CRD (whitelist only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) => sc.setName('grant').setDescription('Grant a user access to CRD')
      .addUserOption((o) => o.setName('user').setDescription('User to grant').setRequired(true)))
    .addSubcommand((sc) => sc.setName('revoke').setDescription('Revoke a user\'s CRD access')
      .addUserOption((o) => o.setName('user').setDescription('User to revoke').setRequired(true)))
    .toJSON(),

  // /crdmanage  (whitelist manages the CRD access list: grant / revoke / list)
  new SlashCommandBuilder()
    .setName('crdmanage')
    .setDescription('Manage the CRD access whitelist (whitelist only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) => sc.setName('grant').setDescription('Give a user access to CRD')
      .addUserOption((o) => o.setName('user').setDescription('User to grant').setRequired(true)))
    .addSubcommand((sc) => sc.setName('revoke').setDescription('Remove a user\'s CRD access')
      .addUserOption((o) => o.setName('user').setDescription('User to revoke').setRequired(true)))
    .addSubcommand((sc) => sc.setName('list').setDescription('List everyone who has been granted CRD access'))
    .toJSON(),

  // /mail
  new SlashCommandBuilder()
    .setName('mail')
    .setDescription('Send an official mail to a user (HI).')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addAttachmentOption((o) => o.setName('attachment').setDescription('Image or file to attach (optional)').setRequired(false))
    .toJSON(),

  // /say
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message to a channel as the bot (whitelist only).')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to send to').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('What to send').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /cleardms
  new SlashCommandBuilder()
    .setName('cleardms')
    .setDescription("Delete all the bot's messages in a user's DMs (owner only).")
    .addUserOption((o) => o.setName('user').setDescription('User whose DMs to clear').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /mwadds
  new SlashCommandBuilder()
    .setName('mwadds')
    .setDescription('Register a staff member on Milweb (HI only).')
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('staff_id').setDescription('Staff ID (e.g. 007)').setRequired(true))
    .toJSON(),

  // /addminfo
  new SlashCommandBuilder()
    .setName('addminfo')
    .setDescription('Complete a Milweb staff profile (owner only).')
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('join_date').setDescription('Staff join date (e.g. 03/12/25)').setRequired(false))
    .addNumberOption((o) => o.setName('security_rate').setDescription('Security rate /10').setMinValue(0).setMaxValue(10).setRequired(false))
    .addRoleOption((o) => o.setName('position').setDescription('Position (role)').setRequired(false))
    .addStringOption((o) =>
      o.setName('status').setDescription('Status').setRequired(false)
        .addChoices(
          { name: 'Under investigation', value: 'under_investigation' },
          { name: 'Active', value: 'active' },
          { name: 'Retired', value: 'retired' },
          { name: 'Suspended', value: 'suspended' },
          { name: 'LOA', value: 'loa' }
        ))
    .addNumberOption((o) => o.setName('activity_rate').setDescription('Activity rate /10').setMinValue(0).setMaxValue(10).setRequired(false))
    .addIntegerOption((o) => o.setName('infraction_past').setDescription('Number of past infractions').setMinValue(0).setRequired(false))
    .addBooleanOption((o) => o.setName('old_staff').setDescription('Old staff?').setRequired(false))
    .addStringOption((o) => o.setName('roblox').setDescription('Roblox username (ID auto-fetched)').setRequired(false))
    .addStringOption((o) => o.setName('division').setDescription('Division / department').setRequired(false))
    .addStringOption((o) => o.setName('note').setDescription('Profile note').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /infract
  new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Staff infraction system (HI only).')
    .addSubcommand((sub) =>
      sub
        .setName('issue')
        .setDescription('Issue a staff infraction. Only HI can use this.')
        .addUserOption((o) => o.setName('user').setDescription('Who receives the infraction').setRequired(true))
        .addStringOption((o) =>
          o.setName('type').setDescription('Infraction type').setRequired(true)
            .addChoices(
              { name: 'Notice', value: 'Notice' },
              { name: 'Warning', value: 'Warning' },
              { name: 'Strike', value: 'Strike' },
              { name: 'Suspension', value: 'Suspension' },
              { name: 'Termination', value: 'Termination' },
              { name: 'Blacklist', value: 'Blacklist' },
              { name: 'Investigation', value: 'Investigation' },
              { name: 'Demotion', value: 'Demotion' }
            ))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the infraction').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('Extra notes').setRequired(true))
        .addStringOption((o) =>
          o.setName('infract_type').setDescription('Presentation of the infraction').setRequired(true)
            .addChoices(
              { name: 'Normal', value: 'Normal' },
              { name: 'HI Case', value: 'HI Case' },
              { name: 'Abuse', value: 'Abuse' }
            ))
        .addStringOption((o) => o.setName('expiration').setDescription('e.g. 5d, 12d or dd/mm/yy (optional)').setRequired(false))
        .addAttachmentOption((o) => o.setName('proof').setDescription('Proof image (optional)').setRequired(false))
        .addStringOption((o) => o.setName('proof_link').setDescription('Proof link (optional)').setRequired(false))
        .addStringOption((o) => o.setName('hi_case').setDescription('Link a HI case id, e.g. HI-2026-0001 or 0008 (optional)').setRequired(false))
        .addBooleanOption((o) => o.setName('public').setDescription('If false, only HI, WL and the user can use the buttons').setRequired(false))
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('⏳ Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log('✅ Registered all commands (incl. mail, cleardms, auth, removebde, infract).');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
