-- Photos/videos are available to signed-in readers, not anonymous map visitors.
-- Changing the bucket to private also closes the old /object/public URLs.
update storage.buckets set public = false where id = 'session-media';
drop policy if exists session_posts_select_public on public.session_posts;
drop policy if exists session_media_select_public on public.session_media;
revoke select on public.session_posts, public.session_media from anon;

create policy session_media_objects_read_signed_in on storage.objects
  for select to authenticated using (
    bucket_id = 'session-media'
    and exists (
      select 1 from public.session_media m
      where m.storage_path = name
        and not public.is_blocked_by_viewer(m.uploader_id)
    )
  );
