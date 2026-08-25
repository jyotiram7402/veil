-- ============================================================================
--  Veil / MyVoxa — v4 migration
--  Run AFTER schema.sql + policies.sql + storage.sql + v2.sql + v3.sql.
--  Idempotent: safe to re-run.
--
--  Design (see audit): a "room" is NOT a new table. It is a
--  public.chats row with type='room', reusing chat_members for membership and
--  messages for chat. This migration adds:
--    - room lifecycle + permission columns on chats
--    - a per-member `blocked` flag on chat_members
--    - an `is_room_guest` flag on profiles (ephemeral join-created accounts)
--    - room_invites   (secure, hashed, expiring, revocable, one-time/limited)
--    - room_audit_log (security-sensitive event trail)
--    - helpers is_room_admin() / can_access_chat()
--    - RLS for the new tables + a backward-compatible tightening of the
--      messages policies so ended/locked rooms and blocked members lose chat.
--
--  Backward compatibility: every added column has a default that reproduces
--  today's behavior for existing direct/group chats (status='active',
--  chat_enabled=true, blocked=false, is_room_guest=false), and can_access_chat
--  is provably equivalent to is_chat_member for any non-room chat.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- chats: allow the 'room' type + room lifecycle / permission columns
-- ---------------------------------------------------------------------------
alter table public.chats drop constraint if exists chats_type_check;
alter table public.chats
  add constraint chats_type_check check (type in ('direct', 'group', 'room'));

alter table public.chats
  add column if not exists status           text not null default 'active',
  add column if not exists expires_at        timestamptz,
  add column if not exists ended_at          timestamptz,
  add column if not exists max_participants  integer,
  add column if not exists chat_enabled      boolean not null default true,
  add column if not exists voice_enabled     boolean not null default false,
  add column if not exists video_enabled     boolean not null default false;

alter table public.chats drop constraint if exists chats_status_check;
alter table public.chats
  add constraint chats_status_check
  check (status in ('active', 'ended', 'expired', 'locked'));

create index if not exists chats_room_status_idx
  on public.chats (status) where type = 'room';

-- ---------------------------------------------------------------------------
-- chat_members: per-member block flag (for admin "block participant")
-- ---------------------------------------------------------------------------
alter table public.chat_members
  add column if not exists blocked boolean not null default false;

-- ---------------------------------------------------------------------------
-- profiles: mark ephemeral accounts minted by the room join flow so they can
-- be filtered out of the member-management UI and cleaned up later.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_room_guest boolean not null default false;

-- ---------------------------------------------------------------------------
-- Helper: is_room_admin(chat, user)
--   True when the user is a global admin AND either created the chat or is an
--   'admin'-role member of it. Referenced by the RLS policies below, so it
--   MUST be defined before those policies are created.
-- ---------------------------------------------------------------------------
create or replace function public.is_room_admin(p_chat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(p_user)
     and exists (
       select 1
       from public.chats c
       left join public.chat_members m
         on m.chat_id = c.id and m.user_id = p_user
       where c.id = p_chat
         and (c.created_by = p_user or m.role = 'admin')
     );
$$;

revoke all on function public.is_room_admin(uuid, uuid) from public;
grant execute on function public.is_room_admin(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helper: can_access_chat(chat, user)
--   Membership predicate used by the message policies. For a non-room chat it
--   is exactly is_chat_member() && not blocked (blocked defaults false, so it
--   reproduces today's behavior). For a room it ALSO requires the room to be
--   'active', so ending/locking a room immediately revokes chat access.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_chat(p_chat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    where m.chat_id = p_chat
      and m.user_id = p_user
      and m.blocked = false
      and (c.type <> 'room' or c.status = 'active')
  );
$$;

revoke all on function public.can_access_chat(uuid, uuid) from public;
grant execute on function public.can_access_chat(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- room_invites: secure invitation credentials for a room.
--
-- The access code is a split token  "<selector>.<verifier>":
--   selector  — public, random, indexed lookup handle (NOT a secret, NOT a DB id)
--   verifier  — the secret half; only its PBKDF2 hash is stored (verifier_hash)
-- The raw verifier is shown to the admin exactly once and never persisted.
-- ---------------------------------------------------------------------------
create table if not exists public.room_invites (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.chats(id) on delete cascade,
  selector      text not null unique,
  verifier_hash text not null,
  label         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  max_uses      integer,                       -- null = unlimited, 1 = one-time
  use_count     integer not null default 0,
  last_used_at  timestamptz,
  claimed_by    uuid references public.profiles(id) on delete set null
);

create index if not exists room_invites_room_idx on public.room_invites (room_id);
create index if not exists room_invites_active_idx
  on public.room_invites (room_id) where revoked_at is null;

alter table public.room_invites enable row level security;

-- Admin-only read. All writes happen via the service role in server routes
-- after an is_room_admin() check, so no insert/update/delete policy is needed.
drop policy if exists "room_invites admin read" on public.room_invites;
create policy "room_invites admin read"
  on public.room_invites for select
  to authenticated
  using (public.is_room_admin(room_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- room_audit_log: security-sensitive event trail. Never stores raw tokens.
-- ---------------------------------------------------------------------------
create table if not exists public.room_audit_log (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid references public.chats(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  target_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_audit_room_idx
  on public.room_audit_log (room_id, created_at desc);

alter table public.room_audit_log enable row level security;

drop policy if exists "room_audit admin read" on public.room_audit_log;
create policy "room_audit admin read"
  on public.room_audit_log for select
  to authenticated
  using (public.is_room_admin(room_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Tighten message policies to use can_access_chat. This revokes chat in ended/
-- locked rooms and for blocked members, while remaining identical to the
-- previous behavior for existing direct/group chats.
-- ---------------------------------------------------------------------------
drop policy if exists "messages select if member" on public.messages;
create policy "messages select if member"
  on public.messages for select
  to authenticated
  using (public.can_access_chat(chat_id, auth.uid()));

drop policy if exists "messages insert by active member" on public.messages;
drop policy if exists "messages insert by member" on public.messages;
create policy "messages insert by active member"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_chat(chat_id, auth.uid())
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.suspended or p.archived)
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: publish the new tables (RLS still scopes what each client sees).
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.room_invites;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.room_audit_log;
  exception when duplicate_object then null;
  end;
end$$;
