-- HOLA JUNTOS: schema v0.1
-- Run this entire file in Supabase Dashboard > SQL Editor > New query.
-- RLS policies keep the flashcard library private to members of a study group.

create extension if not exists pgcrypto;

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nasze fiszki',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (user_id)
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  polish text not null check (length(trim(polish)) > 0),
  spanish text not null check (length(trim(spanish)) > 0),
  phonetic text,
  topic text not null default 'Ogólne',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  box integer not null default 1 check (box between 1 and 5),
  last_rating integer check (last_rating between 0 and 3),
  due_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (user_id, flashcard_id)
);

create index if not exists flashcards_group_created_idx on public.flashcards(group_id, created_at desc);
create index if not exists user_progress_due_idx on public.user_progress(user_id, due_at);

alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.flashcards enable row level security;
alter table public.user_progress enable row level security;

-- Helper checks membership without exposing group rows to non-members.
create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group and gm.user_id = (select auth.uid())
  );
$$;

-- Create a private study group for the signed-in user.
create or replace function public.create_study_group(group_name text default 'Nasze fiszki')
returns public.study_groups language plpgsql security definer set search_path = '' as $$
declare new_group public.study_groups;
begin
  if auth.uid() is null then raise exception 'Zaloguj się, aby utworzyć bazę.'; end if;
  if exists (select 1 from public.group_members where user_id = auth.uid()) then
    raise exception 'To konto należy już do grupy. Użyj istniejącej bazy.';
  end if;
  insert into public.study_groups(name, created_by) values (coalesce(nullif(trim(group_name), ''), 'Nasze fiszki'), auth.uid()) returning * into new_group;
  insert into public.group_members(group_id, user_id, role) values (new_group.id, auth.uid(), 'owner');
  return new_group;
end;
$$;

-- Join a group by invite code. A user can belong to one group in this MVP.
create or replace function public.join_study_group(code_to_join text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_group uuid;
begin
  if auth.uid() is null then raise exception 'Zaloguj się, aby dołączyć do grupy.'; end if;
  if exists (select 1 from public.group_members where user_id = auth.uid()) then
    raise exception 'To konto należy już do grupy.';
  end if;
  select id into found_group from public.study_groups where invite_code = upper(trim(code_to_join));
  if found_group is null then raise exception 'Nie znaleziono grupy dla tego kodu.'; end if;
  insert into public.group_members(group_id, user_id, role) values (found_group, auth.uid(), 'member');
  return found_group;
end;
$$;

-- Restrict callable RPC functions to signed-in users.
revoke all on function public.create_study_group(text) from public, anon;
grant execute on function public.create_study_group(text) to authenticated;
revoke all on function public.join_study_group(text) from public, anon;
grant execute on function public.join_study_group(text) to authenticated;
revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Groups and memberships: a member can view their own group's membership and group.
drop policy if exists "Members can view their group" on public.study_groups;
create policy "Members can view their group" on public.study_groups for select to authenticated using (public.is_group_member(id));
drop policy if exists "Members can view group members" on public.group_members;
create policy "Members can view group members" on public.group_members for select to authenticated using (public.is_group_member(group_id));

-- Fiszkami może zarządzać wyłącznie zalogowany członek danej grupy.
drop policy if exists "Members can read group flashcards" on public.flashcards;
create policy "Members can read group flashcards" on public.flashcards for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Members can add group flashcards" on public.flashcards;
create policy "Members can add group flashcards" on public.flashcards for insert to authenticated with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
drop policy if exists "Members can edit group flashcards" on public.flashcards;
create policy "Members can edit group flashcards" on public.flashcards for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
drop policy if exists "Members can delete group flashcards" on public.flashcards;
create policy "Members can delete group flashcards" on public.flashcards for delete to authenticated using (public.is_group_member(group_id));

-- Each user can read and change only their own learning progress.
drop policy if exists "Users can read own progress" on public.user_progress;
create policy "Users can read own progress" on public.user_progress for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can insert own progress" on public.user_progress;
create policy "Users can insert own progress" on public.user_progress for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.flashcards f where f.id = flashcard_id and public.is_group_member(f.group_id)));
drop policy if exists "Users can update own progress" on public.user_progress;
create policy "Users can update own progress" on public.user_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.flashcards f where f.id = flashcard_id and public.is_group_member(f.group_id)));
drop policy if exists "Users can delete own progress" on public.user_progress;
create policy "Users can delete own progress" on public.user_progress for delete to authenticated using (user_id = (select auth.uid()));

-- Minimal grants: actual row access is further limited by RLS policies above.
grant select on public.study_groups to authenticated;
grant select on public.group_members to authenticated;
grant select, insert, update, delete on public.flashcards to authenticated;
grant select, insert, update, delete on public.user_progress to authenticated;
