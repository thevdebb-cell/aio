-- ============================================================
--  CRD auto-sync (real-time)
--  When a case or a staff profile is created / updated on the
--  MilWeb (Dillan) side or by the bot, mirror it into CRD
--  automatically. No manual "Sync now" needed.
--
--  Run this ONCE in the Supabase SQL editor, after crd-schema.sql.
--  Safe to re-run (drops + recreates the triggers).
-- ============================================================

-- crd_staff needs a way to upsert synced rows without clobbering
-- manually-added staff who happen to share a discord id.
create unique index if not exists crd_staff_milweb_uniq
  on crd_staff (discord_id) where source = 'milweb';

-- ---------- STAFF: milweb_profiles -> crd_staff ----------
create or replace function crd_sync_profile() returns trigger
language plpgsql security definer as $$
declare cat text;
begin
  if coalesce(new.old_staff, false) then
    cat := 'before_revamp';
  elsif lower(coalesce(new.status, '')) in ('retired','fired','blacklisted','suspended','dr','d/r') then
    cat := 'inactive';
  else
    cat := 'active';
  end if;

  insert into crd_staff (discord_id, username, position, category, join_date,
                         roblox_username, roblox_id, notes, source, created_at)
  values (new.user_id, coalesce(new.username, 'Unknown'), new.position_role_name, cat,
          new.join_date, new.roblox, new.roblox_id, new.note, 'milweb', now())
  on conflict (discord_id) where source = 'milweb'
  do update set username = excluded.username,
                position = excluded.position,
                category = excluded.category,
                join_date = excluded.join_date,
                roblox_username = excluded.roblox_username,
                roblox_id = excluded.roblox_id,
                notes = excluded.notes;
  return new;
end;
$$;

drop trigger if exists trg_crd_sync_profile on milweb_profiles;
create trigger trg_crd_sync_profile
  after insert or update on milweb_profiles
  for each row execute function crd_sync_profile();

-- ---------- CASES: cases -> crd_cases ----------
create or replace function crd_sync_case() returns trigger
language plpgsql security definer as $$
declare cat text;
begin
  if coalesce(new.deleted, false) then
    return new;  -- do not import deleted cases
  end if;

  if lower(coalesce(new.status, '')) in ('closed','confirmed','expired') then
    cat := 'inactive';
  else
    cat := 'active';
  end if;

  insert into crd_cases (number, category, subject_id, subject_username, date_opened,
                         subject_matter, status, department, outcome, source, created_at)
  values (new.number, cat, new.subject_id, coalesce(new.subject_username, 'Unknown'),
          coalesce(new.date_submitted, extract(epoch from now())::bigint),
          nullif(new.violations::text, 'null'), coalesce(new.status, 'On file'),
          new.dept, new.sanction, 'milweb', now())
  on conflict (number)
  do update set category = excluded.category,
                subject_id = excluded.subject_id,
                subject_username = excluded.subject_username,
                subject_matter = excluded.subject_matter,
                status = excluded.status,
                department = excluded.department,
                outcome = excluded.outcome;
  return new;
end;
$$;

drop trigger if exists trg_crd_sync_case on cases;
create trigger trg_crd_sync_case
  after insert or update on cases
  for each row execute function crd_sync_case();

-- Note: newly synced cases default to confidentiality = 'internal', so they are
-- NOT visible on the public site until someone declassifies them (sets it to
-- 'public') from CRD. That is intentional.

notify pgrst, 'reload schema';
