-- ============================================================================
--  BlackFoxx — v13 migration
--  Run AFTER v2..v12.sql. Idempotent. v11 matters most here: before it, a
--  member could lift their own suspension. The app works with or without v13.
--
--  A suspended or archived person loses every chat at once, even on a phone
--  that is still signed in. Until now only sending was refused (the insert
--  policy on messages): reading went on, new messages included, for as long
--  as that phone stayed signed in.
--
--   1. is_active_profile(user): true unless that person is suspended or
--      archived.
--   2. can_access_chat() (reading messages, calls) and is_chat_member()
--      (chats, members, attachments, call signalling) now also require it.
--
--  Every policy and every route asks these two helpers about the signed-in
--  person themselves (auth.uid()), so nobody else is affected: the admin is
--  never suspended, and the server uses the service role.
--
--  All or nothing: if any statement fails, nothing is changed.
-- ============================================================================

begin;

create or replace function public.is_active_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and not p.suspended
      and not p.archived
  );
$$;

revoke all on function public.is_active_profile(uuid) from public;
grant execute on function public.is_active_profile(uuid) to authenticated, service_role;

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
  )
  and public.is_active_profile(p_user);
$$;

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
      and m.removed_at is null
      and (c.type <> 'room' or c.status in ('active', 'locked'))
  )
  and public.is_active_profile(p_user);
$$;

commit;
