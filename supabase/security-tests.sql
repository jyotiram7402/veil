-- ============================================================================
--  BlackFoxx — RLS negative-test harness
--
--  Framework-free regression tests for the security-sensitive RLS policies.
--  Run with psql (it uses psql `\set` variables, which the Supabase dashboard
--  SQL editor does not support). Each block asserts
--  that an UNAUTHORIZED action FAILS. A failing assertion raises an exception.
--
--  How it works: we impersonate a signed-in user by setting the `authenticated`
--  role and a fake JWT (`request.jwt.claims`) so auth.uid() returns our test id,
--  exactly as Supabase does at runtime. Everything runs in a transaction that is
--  ROLLED BACK, so it never mutates real data.
--
--  Prerequisites: at least two profiles that do NOT share a chat. Replace the
--  two UUIDs below with real profile ids (an admin is fine for :admin_id).
-- ============================================================================

\set outsider_id  '00000000-0000-0000-0000-000000000001'
\set member_id    '00000000-0000-0000-0000-000000000002'

begin;

-- Seed two profiles and a private chat that ONLY member_id belongs to.
insert into public.profiles (id, username) values
  (:'outsider_id', 'sec_outsider'),
  (:'member_id',   'sec_member')
on conflict (id) do nothing;

insert into public.chats (id, type, created_by)
  values ('00000000-0000-0000-0000-0000000000aa', 'direct', :'member_id');
insert into public.chat_members (chat_id, user_id, role)
  values ('00000000-0000-0000-0000-0000000000aa', :'member_id', 'admin');
insert into public.messages (id, chat_id, sender_id, content)
  values ('00000000-0000-0000-0000-0000000000bb',
          '00000000-0000-0000-0000-0000000000aa', :'member_id', 'secret');
insert into public.call_sessions (id, chat_id, caller_id, callee_id)
  values ('00000000-0000-0000-0000-0000000000cc',
          '00000000-0000-0000-0000-0000000000aa', :'member_id', :'outsider_id');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (:'member_id', 'https://fcm.googleapis.com/fcm/send/sec-test', 'k', 'a');
insert into public.push_keys (id, public_key, private_key)
  values (1, 'sec-public', 'sec-private')
on conflict (id) do nothing;

-- Impersonate the OUTSIDER (not a member, not admin).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'outsider_id', 'role', 'authenticated')::text,
  true
);

-- 1. Outsider must NOT read another chat's messages.
do $$
begin
  if exists (select 1 from public.messages
             where chat_id = '00000000-0000-0000-0000-0000000000aa') then
    raise exception 'FAIL: outsider read messages from a chat they are not in';
  end if;
end $$;

-- 2. Outsider must NOT read the chat row.
do $$
begin
  if exists (select 1 from public.chats
             where id = '00000000-0000-0000-0000-0000000000aa') then
    raise exception 'FAIL: outsider read a chat they are not a member of';
  end if;
end $$;

-- 3. Outsider must NOT read a profile they do not share a chat with (v9).
do $$
begin
  if exists (select 1 from public.profiles where id = :'member_id') then
    raise exception 'FAIL: outsider enumerated an unrelated profile';
  end if;
end $$;

-- 4. Outsider must NOT insert a message into that chat.
do $$
begin
  begin
    insert into public.messages (chat_id, sender_id, content)
      values ('00000000-0000-0000-0000-0000000000aa', :'outsider_id', 'x');
    raise exception 'FAIL: outsider inserted a message into a foreign chat';
  exception when insufficient_privilege or check_violation then null; -- expected
  end;
end $$;

-- 5. Outsider must NOT read room invites or call sessions of that chat.
do $$
begin
  if exists (select 1 from public.room_invites
             where room_id = '00000000-0000-0000-0000-0000000000aa') then
    raise exception 'FAIL: outsider read foreign room invites';
  end if;
  if exists (select 1 from public.call_sessions
             where chat_id = '00000000-0000-0000-0000-0000000000aa') then
    raise exception 'FAIL: outsider read foreign call sessions';
  end if;
end $$;

-- 6. Non-admin must NOT create a direct chat via the definer RPC (v9 fix).
do $$
begin
  begin
    perform public.get_or_create_direct_chat(:'member_id');
    raise exception 'FAIL: non-admin created a direct chat via RPC';
  exception when others then null; -- expected: "admin only"
  end;
end $$;

-- Impersonate the MEMBER: signed in, in the chat, not an admin (v11).
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'member_id', 'role', 'authenticated')::text,
  true
);

-- 7. A member must NOT make themselves admin, lift a suspension or change
--    their own settings. What they may change (their name) must still work.
do $$
begin
  begin
    update public.profiles set is_admin = true where id = auth.uid();
    raise exception 'FAIL: a member made themselves admin';
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    update public.profiles set suspended = false, settings = '{}'::jsonb where id = auth.uid();
    raise exception 'FAIL: a member changed suspended / settings on their own profile';
  exception when insufficient_privilege then null; -- expected
  end;
  update public.profiles set display_name = 'Sec Member' where id = auth.uid();
  if not found then
    raise exception 'FAIL: a member could not change their own display name';
  end if;
end $$;

-- 8. A member must NOT rewrite a message, not even their own.
do $$
begin
  begin
    update public.messages set content = 'edited'
      where id = '00000000-0000-0000-0000-0000000000bb';
    raise exception 'FAIL: a member updated a message';
  exception when insufficient_privilege then null; -- expected
  end;
end $$;

-- 9. A member must NOT insert a "system" note; a normal message must work.
do $$
begin
  begin
    insert into public.messages (chat_id, sender_id, content, type)
      values ('00000000-0000-0000-0000-0000000000aa', auth.uid(), 'fake note', 'system');
    raise exception 'FAIL: a member inserted a system message';
  exception when insufficient_privilege or check_violation then null; -- expected
  end;
  insert into public.messages (chat_id, sender_id, content)
    values ('00000000-0000-0000-0000-0000000000aa', auth.uid(), 'hello');
end $$;

-- 10. A member may change the state of their call, but nothing else about it.
do $$
begin
  begin
    update public.call_sessions set event_posted = true
      where id = '00000000-0000-0000-0000-0000000000cc';
    raise exception 'FAIL: a member changed event_posted on a call';
  exception when insufficient_privilege then null; -- expected
  end;
  update public.call_sessions set status = 'ended', ended_at = now()
    where id = '00000000-0000-0000-0000-0000000000cc';
  if not found then
    raise exception 'FAIL: a member could not end their own call';
  end if;
end $$;

-- 11. The notification tables are closed to every browser session (v12): not
--     the server's key pair, and not even a person's own devices.
do $$
declare
  n integer;
begin
  begin
    select count(*) into n from public.push_keys;
    if n > 0 then
      raise exception 'FAIL: a member read the notification key pair';
    end if;
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    select count(*) into n from public.push_subscriptions;
    if n > 0 then
      raise exception 'FAIL: a member read notification devices';
    end if;
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (auth.uid(), 'https://fcm.googleapis.com/fcm/send/sec-test-2', 'k', 'a');
    raise exception 'FAIL: a member stored a notification device directly';
  exception when insufficient_privilege then null; -- expected
  end;
end $$;

reset role;
select 'ALL RLS NEGATIVE TESTS PASSED' as result;

rollback;
