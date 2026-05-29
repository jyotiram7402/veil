-- ============================================================================
--  Rooms — Row Level Security policies
--  Run after schema.sql. Idempotent.
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.chats         enable row level security;
alter table public.chat_members  enable row level security;
alter table public.messages      enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles read all signed-in" on public.profiles;
create policy "profiles read all signed-in"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- inserts/deletes happen via service role only (admin user-creation flow)

-- ---------------------------------------------------------------------------
-- chats — visible only to members
-- ---------------------------------------------------------------------------
drop policy if exists "chats select if member" on public.chats;
create policy "chats select if member"
  on public.chats for select
  to authenticated
  using (public.is_chat_member(id, auth.uid()));

drop policy if exists "chats insert by self" on public.chats;
create policy "chats insert by self"
  on public.chats for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "chats update by chat admin" on public.chats;
create policy "chats update by chat admin"
  on public.chats for update
  to authenticated
  using (public.is_chat_admin(id, auth.uid()))
  with check (public.is_chat_admin(id, auth.uid()));

drop policy if exists "chats delete by chat admin" on public.chats;
create policy "chats delete by chat admin"
  on public.chats for delete
  to authenticated
  using (public.is_chat_admin(id, auth.uid()));

-- ---------------------------------------------------------------------------
-- chat_members
-- ---------------------------------------------------------------------------
drop policy if exists "members visible to members" on public.chat_members;
create policy "members visible to members"
  on public.chat_members for select
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "members insert by chat admin or self-join group creator" on public.chat_members;
create policy "members insert by chat admin or self-join group creator"
  on public.chat_members for insert
  to authenticated
  with check (
    -- the chat creator can seed the initial roster
    exists (
      select 1 from public.chats c
      where c.id = chat_id
        and c.created_by = auth.uid()
    )
    or public.is_chat_admin(chat_id, auth.uid())
  );

drop policy if exists "members update last_read by self" on public.chat_members;
create policy "members update last_read by self"
  on public.chat_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "members delete by chat admin or self leave" on public.chat_members;
create policy "members delete by chat admin or self leave"
  on public.chat_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_chat_admin(chat_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
drop policy if exists "messages select if member" on public.messages;
create policy "messages select if member"
  on public.messages for select
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "messages insert by member" on public.messages;
create policy "messages insert by member"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_member(chat_id, auth.uid())
  );

drop policy if exists "messages update by sender" on public.messages;
create policy "messages update by sender"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists "messages delete by sender or chat admin" on public.messages;
create policy "messages delete by sender or chat admin"
  on public.messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    or public.is_chat_admin(chat_id, auth.uid())
  );
