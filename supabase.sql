-- =====================================================================
--  Star Customs AIO - Supabase schema
--  Run this ONCE in your Supabase project: SQL Editor -> New query ->
--  paste all of this -> Run.
--  Then set STORE_DRIVER=supabase, SUPABASE_URL and SUPABASE_SERVICE_KEY
--  in the bot env (bot-hosting.net). Without those the bot uses local JSON.
--
--  Every table stores its record as a single JSONB column named "data",
--  keyed by a small id column - this matches how the bot reads/writes.
-- =====================================================================

-- Per-guild settings (roles, channels, service statuses, order panel...)
create table if not exists public.guilds (
  guild_id   text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Open tickets (support + order), keyed by their channel id
create table if not exists public.tickets (
  channel_id text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Orders, keyed by the unique order id
create table if not exists public.orders (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Ratings / reviews left by buyers
create table if not exists public.ratings (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Log of every ! prefix command run by staff (auto-incrementing id so the
-- bot can pull the most recent ones with "order by id desc")
create table if not exists public.prefix_logs (
  id         bigint generated always as identity primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Moderation records (bans, kicks, timeouts, warns, infractions, promotions)
create table if not exists public.mod_records (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes for the guild-scoped listings the bot does
create index if not exists tickets_guild_idx     on public.tickets     ((data->>'guildId'));
create index if not exists orders_guild_idx      on public.orders      ((data->>'guildId'));
create index if not exists ratings_guild_idx     on public.ratings     ((data->>'guildId'));
create index if not exists prefix_logs_guild_idx on public.prefix_logs ((data->>'guildId'));
create index if not exists mod_records_guild_idx on public.mod_records ((data->>'guildId'));

-- The bot connects with the SERVICE ROLE key, which bypasses RLS. Leaving RLS
-- enabled with no policies keeps the tables private from the anon/public key.
alter table public.guilds      enable row level security;
alter table public.tickets     enable row level security;
alter table public.orders      enable row level security;
alter table public.ratings     enable row level security;
alter table public.prefix_logs enable row level security;
alter table public.mod_records enable row level security;
