-- ============================================================================
--  Rooms / Veil — v2 migration
--  Run AFTER schema.sql + policies.sql + storage.sql.
--  Idempotent: safe to re-run.
--
--  Adds:
--   - invite_tokens (per-user reusable URL)
--   - app_settings  (runtime admin toggles)
--   - profiles.suspended, profiles.archived
--   - new RLS: only admin can create chats; chats are admin↔one-user only
--   - get_or_create_admin_user_chat RPC
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: new flags
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists suspended boolean not null default false,
  add column if not exists archived  boolean not null default false;

-- ---------------------------------------------------------------------------
-- invite_tokens: each user has at most one active token
-- ---------------------------------------------------------------------------
create table if not exists public.invite_tokens (
  token         text primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  use_count     integer not null default 0
);

create unique index if not exists invite_tokens_active_user
  on public.invite_tokens (user_id) where revoked_at is null;

alter table public.invite_tokens enable row level security;

drop policy if exists "tokens admin-only read" on public.invite_tokens;
create policy "tokens admin-only read"
  on public.invite_tokens for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- write paths happen via service role (server routes), so no insert/update/delete
-- policies for authenticated needed.

-- ---------------------------------------------------------------------------
-- app_settings: runtime knobs
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "settings admin-only" on public.app_settings;
create policy "settings admin-only"
  on public.app_settings for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- defaults
insert into public.app_settings (key, value) values
  ('uploads_enabled',    'true'::jsonb),
  ('max_message_length', '4000'::jsonb),
  ('screen_guard',       'true'::jsonb),
  ('typing_indicator',   'true'::jsonb),
  ('user_session_ephemeral', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- helper: is_admin(uid)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tighten chat creation: only admin can create new chats. All new chats are
-- direct (admin ↔ user). Existing chats (groups, etc.) remain readable to
-- their members but cannot be added to.
-- ---------------------------------------------------------------------------
drop policy if exists "chats insert by self" on public.chats;
create policy "chats insert by admin only"
  on public.chats for insert
  to authenticated
  with check (public.is_admin(auth.uid()) and created_by = auth.uid());

-- Only admin can update/delete chats (matches original 'admin of the chat' but
-- now globally enforced via is_admin)
drop policy if exists "chats update by chat admin" on public.chats;
create policy "chats update by admin"
  on public.chats for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "chats delete by chat admin" on public.chats;
create policy "chats delete by admin"
  on public.chats for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Members can only be added/removed by admin
drop policy if exists "members insert by chat admin or self-join group creator" on public.chat_members;
create policy "members insert by admin"
  on public.chat_members for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "members delete by chat admin or self leave" on public.chat_members;
create policy "members delete by admin"
  on public.chat_members for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Messages: senders must NOT be suspended.
drop policy if exists "messages insert by member" on public.messages;
create policy "messages insert by active member"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_member(chat_id, auth.uid())
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.suspended or p.archived)
    )
  );

-- ---------------------------------------------------------------------------
-- get_or_create_admin_user_chat(p_user)
--   Admin-only. Returns the unique chat between the admin and a specific user.
--   Creates it if it doesn't exist.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_admin_user_chat(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_admin is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_admin(v_admin) then
    raise exception 'admin only';
  end if;
  if v_admin = p_user then
    raise exception 'cannot start a chat with yourself';
  end if;

  select c.id into v_chat_id
    from public.chats c
    join public.chat_members a on a.chat_id = c.id and a.user_id = v_admin
    join public.chat_members b on b.chat_id = c.id and b.user_id = p_user
   where c.type = 'direct'
   limit 1;

  if v_chat_id is not null then
    return v_chat_id;
  end if;

  insert into public.chats (type, created_by)
    values ('direct', v_admin)
    returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id, role)
    values (v_chat_id, v_admin, 'admin'),
           (v_chat_id, p_user, 'member');

  return v_chat_id;
end;
$$;

revoke all on function public.get_or_create_admin_user_chat(uuid) from public;
grant execute on function public.get_or_create_admin_user_chat(uuid) to authenticated;

-- Realtime
alter publication supabase_realtime add table public.invite_tokens;
alter publication supabase_realtime add table public.app_settings;
