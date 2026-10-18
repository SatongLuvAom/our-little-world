-- Phase 0 schema foundation. Apply to an EMPTY Supabase project only.
-- All writes are intentionally denied to browser roles until audited RPCs land
-- in Phases 1–4. This migration does not enable online functionality.
begin;
create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  avatar_path text, created_at timestamptz not null default now()
);
create table public.couples (
  id uuid primary key default gen_random_uuid(), anniversary date not null,
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  created_at timestamptz not null default now()
);
create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), primary key(couple_id, user_id)
);
create function private.limit_couple_members() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Serialize membership changes against the parent row, including concurrent invitations.
  perform 1 from public.couples where id = new.couple_id for update;
  if (select count(*) from public.couple_members where couple_id = new.couple_id and user_id <> new.user_id) >= 2 then
    raise exception 'A couple can have at most two members';
  end if;
  return new;
end $$;
create trigger limit_couple_members before insert or update on public.couple_members for each row execute function private.limit_couple_members();
create function private.is_member(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.couple_members where couple_id = target and user_id = (select auth.uid()));
$$;
revoke all on function private.is_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

create table public.invitations (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  token_hash text not null unique, created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null, accepted_at timestamptz, created_at timestamptz not null default now()
);
create table public.quests (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null check(length(trim(title)) between 1 and 120), assigned_to uuid,
  due_on date not null, recurrence text not null check(recurrence in ('once','daily','weekly')),
  heart_reward integer not null check(heart_reward between 1 and 500), archived_at timestamptz,
  created_at timestamptz not null default now(), unique(couple_id,id),
  foreign key(couple_id,assigned_to) references public.couple_members(couple_id,user_id)
);
create table public.quest_completions (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  quest_id uuid not null, completed_by uuid not null, period_key text not null,
  reward integer not null check(reward between 1 and 500), created_at timestamptz not null default now(),
  unique(quest_id,period_key), foreign key(couple_id,quest_id) references public.quests(couple_id,id),
  foreign key(couple_id,completed_by) references public.couple_members(couple_id,user_id)
);
create table public.heart_transactions (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  amount integer not null check(amount <> 0), reason text not null,
  idempotency_key uuid not null unique, created_at timestamptz not null default now()
);
create table public.rewards (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null check(length(trim(title)) between 1 and 120), cost integer not null check(cost > 0),
  archived_at timestamptz, unique(couple_id,id)
);
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  reward_id uuid not null, redeemed_by uuid not null, cost integer not null check(cost > 0),
  idempotency_key uuid not null unique, created_at timestamptz not null default now(),
  foreign key(couple_id,reward_id) references public.rewards(couple_id,id),
  foreign key(couple_id,redeemed_by) references public.couple_members(couple_id,user_id)
);
create table public.saving_goals (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null check(length(trim(title)) between 1 and 120), target numeric(14,2) not null check(target > 0),
  due_on date not null, unique(couple_id,id)
);
create table public.saving_transactions (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  goal_id uuid not null, contributor uuid not null, amount numeric(14,2) not null check(amount <> 0),
  note text not null default '', idempotency_key uuid not null unique,
  reverses_id uuid unique references public.saving_transactions(id), created_at timestamptz not null default now(),
  foreign key(couple_id,goal_id) references public.saving_goals(couple_id,id),
  foreign key(couple_id,contributor) references public.couple_members(couple_id,user_id)
);
create function private.immutable_ledger() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Ledger entries are immutable; use a new correction transaction'; end $$;
create trigger immutable_savings before update or delete on public.saving_transactions for each row execute function private.immutable_ledger();
create trigger immutable_hearts before update or delete on public.heart_transactions for each row execute function private.immutable_ledger();
create table public.date_plans (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null, place text not null, starts_at timestamptz not null,
  budget numeric(14,2) not null default 0 check(budget >= 0)
);
create table public.wishlists (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null, category text not null check(category in ('place','food','item')), done boolean not null default false
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null, event_on date not null, kind text not null check(kind in ('activity','special','anniversary'))
);
create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  user_id uuid not null, day date not null, mood text not null, note text not null default '',
  unique(user_id,day), foreign key(couple_id,user_id) references public.couple_members(couple_id,user_id)
);
create table public.memories (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  title text not null, memory_on date not null, note text not null default '', photo_path text,
  created_at timestamptz not null default now()
);
create table public.love_letters (
  id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
  author uuid not null, title text not null, body text not null, opens_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(couple_id,author) references public.couple_members(couple_id,user_id)
);
create table public.couple_pets (
  couple_id uuid primary key references public.couples(id), name text not null default 'โมจิ',
  last_fed_at timestamptz, feed_count integer not null default 0 check(feed_count >= 0), equipped_item text
);
create table public.pet_inventory (
  couple_id uuid not null references public.couples(id), item_id text not null,
  acquired_at timestamptz not null default now(), primary key(couple_id,item_id)
);

-- Fail closed: reads are scoped to members; no client INSERT/UPDATE/DELETE policies.
-- Pairing, awards, redemptions and savings require server validation + atomic RPCs.
do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','couples','couple_members','invitations','quests','quest_completions','heart_transactions','rewards','reward_redemptions','saving_goals','saving_transactions','date_plans','wishlists','calendar_events','mood_checkins','memories','love_letters','couple_pets','pet_inventory'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon, authenticated',tbl);
  end loop;
  foreach tbl in array array['couple_members','quests','quest_completions','heart_transactions','rewards','reward_redemptions','saving_goals','saving_transactions','date_plans','wishlists','calendar_events','mood_checkins','memories','couple_pets','pet_inventory'] loop
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('create policy member_read on public.%I for select to authenticated using (private.is_member(couple_id))',tbl);
    if tbl not in ('couple_members','couple_pets','pet_inventory') then
      execute format('create index on public.%I (couple_id)',tbl);
    end if;
  end loop;
end $$;
grant select on public.profiles, public.couples, public.love_letters to authenticated;
create policy own_or_partner_profile on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists(select 1 from public.couple_members m where m.user_id = profiles.id and private.is_member(m.couple_id))
);
create policy member_couple on public.couples for select to authenticated using (private.is_member(id));
-- The entire letter row is inaccessible until the server clock reaches opens_at.
create policy opened_letters_only on public.love_letters for select to authenticated using (private.is_member(couple_id) and opens_at <= now());
create index letters_opening on public.love_letters(couple_id,opens_at);
create index date_plans_upcoming on public.date_plans(couple_id,starts_at);
create index calendar_by_day on public.calendar_events(couple_id,event_on);
create index memory_timeline on public.memories(couple_id,memory_on desc);
create index savings_history on public.saving_transactions(couple_id,created_at desc);
create index hearts_history on public.heart_transactions(couple_id,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('couple-memories','couple-memories',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy private_memory_read on storage.objects for select to authenticated using (
  bucket_id = 'couple-memories' and (storage.foldername(name))[1] in (select couple_id::text from public.couple_members where user_id = (select auth.uid()))
);
-- Upload/delete remain denied pending Phase 4 server-side checks.
commit;
