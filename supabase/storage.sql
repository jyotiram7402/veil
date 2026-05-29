-- ============================================================================
--  Rooms — Storage buckets & policies
--  Buckets:
--    avatars      (public)  -> profile/group images
--    attachments  (private) -> chat attachments; served via signed URLs
-- ============================================================================

-- Create buckets (idempotent)
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- avatars: public read, owner-write under a path of {user_id}/...
-- ---------------------------------------------------------------------------
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- attachments: private. Path convention is {chat_id}/{uuid}-{filename}.
-- Read/write only if the caller is a member of that chat.
-- ---------------------------------------------------------------------------
drop policy if exists "attachments member read" on storage.objects;
create policy "attachments member read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_chat_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

drop policy if exists "attachments member write" on storage.objects;
create policy "attachments member write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_chat_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

drop policy if exists "attachments owner delete" on storage.objects;
create policy "attachments owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and owner = auth.uid()
  );
