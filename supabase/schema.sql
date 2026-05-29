-- ============================================================================
--  Rooms — schema
--  Run this file once in the Supabase SQL editor (project > SQL > New query).
--  It is idempotent: safe to re-run after edits.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users. The username is the user-facing handle.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique
                 check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url   text,
  bio          text check (char_length(bio) <= 280),
  is_admin     boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- chats: holds both DMs (type='direct') and groups (type='group')
-- ---------------------------------------------------------------------------
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('direct', 'group')),
  name        text,
  avatar_url  text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chats_updated_at_idx
  on public.chats (updated_at desc);

-- ---------------------------------------------------------------------------
-- chat_members
-- ---------------------------------------------------------------------------
create table if not exists public.chat_members (
  chat_id      uuid not null references public.chats(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_members_user_idx
  on public.chat_members (user_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  chat_id         uuid not null references public.chats(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null,
  content         text,
  type            text not null default 'text'
                    check (type in ('text', 'image', 'file', 'system')),
  attachment_url  text,
  attachment_name text,
  attachment_size integer,
  attachment_mime text,
  reply_to        uuid references public.messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  constraint messages_has_payload
    check (content is not null or attachment_url is not null)
);

create index if not exists messages_chat_created_idx
  on public.messages (chat_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers: membership predicate used by RLS to avoid recursive policy lookups.
-- SECURITY DEFINER so the function can see chat_members regardless of caller.
-- ---------------------------------------------------------------------------
create or replace function public.is_chat_member(p_chat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    where m.chat_id = p_chat
      and m.user_id = p_user
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated, service_role;

create or replace function public.is_chat_admin(p_chat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    where m.chat_id = p_chat
      and m.user_id = p_user
      and m.role = 'admin'
  );
$$;

revoke all on function public.is_chat_admin(uuid, uuid) from public;
grant execute on function public.is_chat_admin(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Touch chats.updated_at on every new message so chat list sorts naturally.
-- ---------------------------------------------------------------------------
create or replace function public.touch_chat_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.chats
     set updated_at = new.created_at
   where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_chat on public.messages;
create trigger messages_touch_chat
  after insert on public.messages
  for each row
  execute function public.touch_chat_on_message();

-- ---------------------------------------------------------------------------
-- Get-or-create direct chat between two users. Returns the chat id.
-- Used by /api/chats POST when type='direct'.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_direct_chat(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if v_me = p_other then
    raise exception 'cannot create direct chat with self';
  end if;

  select c.id into v_chat_id
    from public.chats c
    join public.chat_members a on a.chat_id = c.id and a.user_id = v_me
    join public.chat_members b on b.chat_id = c.id and b.user_id = p_other
   where c.type = 'direct'
   limit 1;

  if v_chat_id is not null then
    return v_chat_id;
  end if;

  insert into public.chats (type, created_by)
    values ('direct', v_me)
    returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id, role)
    values (v_chat_id, v_me, 'admin'),
           (v_chat_id, p_other, 'member');

  return v_chat_id;
end;
$$;

revoke all on function public.get_or_create_direct_chat(uuid) from public;
grant execute on function public.get_or_create_direct_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: publish the tables we want to stream to clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chats;
alter publication supabase_realtime add table public.chat_members;
alter publication supabase_realtime add table public.profiles;
