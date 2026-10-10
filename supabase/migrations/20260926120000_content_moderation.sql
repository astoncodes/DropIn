-- Content moderation: player reports, player blocks and admin take-down.
--
-- Session posts and their photos or clips are public, even to signed-out
-- readers; session chat, display names and session titles are player-written
-- too. App Store Review Guideline 1.2 and Google Play's user-generated content
-- policy require a way to report objectionable content, a way to block abusive
-- players, and a moderator who acts on reports. This migration provides all
-- three, and closes a path that let players publish arbitrary external media.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
-- A block hides the blocked player's posts, media and chat messages from the
-- blocker. It is one-directional and private: the blocked player is not told,
-- and nothing they can see changes. Profiles and sessions stay visible, because
-- a shared session still needs to show who is attending.

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

revoke all on public.user_blocks from anon, authenticated;
alter table public.user_blocks enable row level security;

create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

grant select, delete on public.user_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.user_blocks to authenticated;

create trigger guard_account_deletion before insert or update on public.user_blocks
  for each statement execute function public.guard_account_deletion();

-- Invoker rights are enough: user_blocks lets a signed-in caller read exactly
-- their own blocks, which is the only question this answers.
create function public.is_blocked_by_viewer(p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
     where b.blocker_id = (select auth.uid()) and b.blocked_id = p_user_id
  )
$$;
revoke all on function public.is_blocked_by_viewer(uuid) from public, anon;
grant execute on function public.is_blocked_by_viewer(uuid) to authenticated;

-- Signed-out readers cannot block anyone and keep the unfiltered public read.
-- Signed-in readers get the same rows minus players they blocked.
alter policy session_posts_select_public on public.session_posts to anon;
create policy session_posts_select_unblocked on public.session_posts
  for select to authenticated using (not public.is_blocked_by_viewer(author_id));

alter policy session_media_select_public on public.session_media to anon;
create policy session_media_select_unblocked on public.session_media
  for select to authenticated using (not public.is_blocked_by_viewer(uploader_id));

alter policy session_messages_select_member on public.session_messages
  using (public.is_session_member(session_id) and not public.is_blocked_by_viewer(user_id));

-- ---------------------------------------------------------------------------
-- Player-registered media must be their own Storage upload
-- ---------------------------------------------------------------------------
-- remote_url exists for curated fixtures. Accepting any https URL from a
-- player let them place arbitrary external content in the public feed, outside
-- the bucket's type and size limits and beyond take-down.
alter policy session_media_insert_member on public.session_media
  with check (uploader_id = (select auth.uid()) and remote_url is null and exists (
    select 1 from public.session_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and public.can_post_to_session(p.session_id)
      and p.location_verified_at > now() - interval '15 minutes'
  ));

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create type public.report_target as enum ('session_post', 'session_message', 'run_session', 'profile');

create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'sexual_content', 'violence', 'self_harm', 'illegal',
  'impersonation', 'other'
);

create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  -- A reporter who deletes their account leaves the report for review.
  reporter_id uuid references auth.users (id) on delete set null,
  target_kind public.report_target not null,
  target_id uuid not null,
  -- The player who wrote the content. Their account deletion removes the
  -- content, so the report about it goes too.
  target_user_id uuid not null references auth.users (id) on delete cascade,
  reason public.report_reason not null,
  details text,
  -- What the reporter saw, kept so a moderator can judge content its author
  -- edited or deleted after the report.
  content_snapshot text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text,

  constraint content_reports_details_length check (
    details is null or char_length(details) between 1 and 500
  ),
  constraint content_reports_snapshot_length check (
    content_snapshot is null or char_length(content_snapshot) <= 1000
  ),
  constraint content_reports_note_length check (
    resolution_note is null or char_length(resolution_note) between 1 and 500
  ),
  constraint content_reports_resolution_state check ((status = 'open') = (resolved_at is null))
);

comment on table public.content_reports is
  'Player reports of objectionable content. Written only by report_content(); resolved only by admin_resolve_reports().';

-- A retried report must not queue the same content twice for one reporter.
create unique index content_reports_one_open_per_reporter
  on public.content_reports (reporter_id, target_kind, target_id) where status = 'open';
create index content_reports_open_queue_idx
  on public.content_reports (created_at) where status = 'open';
create index content_reports_target_idx on public.content_reports (target_kind, target_id);

revoke all on public.content_reports from anon, authenticated;
alter table public.content_reports enable row level security;

-- Only moderators read reports. Reporters are not shown queue state or notes.
create policy content_reports_select_admin on public.content_reports
  for select to authenticated using (public.is_admin());
grant select on public.content_reports to authenticated;

create trigger guard_account_deletion before insert or update on public.content_reports
  for each statement execute function public.guard_account_deletion();

-- SECURITY DEFINER because content_reports has no insert grant, and because a
-- reporter's view of a chat message is checked here explicitly: the function
-- reads the reported row itself, then admits it only if the caller could see it.
create function public.report_content(
  p_target_kind public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_target_user uuid;
  v_snapshot text;
  v_details text := nullif(btrim(p_details), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to report content.' using errcode = '42501';
  end if;
  if p_target_kind is null or p_target_id is null or p_reason is null then
    raise exception 'Choose what you are reporting and why.' using errcode = '22023';
  end if;
  if char_length(v_details) > 500 then
    raise exception 'Keep report details to 500 characters.' using errcode = '22023';
  end if;

  if p_target_kind = 'session_post' then
    select p.author_id, p.caption into v_target_user, v_snapshot
      from public.session_posts p where p.id = p_target_id;
  elsif p_target_kind = 'session_message' then
    select m.user_id, m.body into v_target_user, v_snapshot
      from public.session_messages m
     where m.id = p_target_id and public.is_session_member(m.session_id);
  elsif p_target_kind = 'run_session' then
    select r.organizer_id,
           concat_ws(' · ', coalesce(s.title, r.title), r.description, s.location_name)
      into v_target_user, v_snapshot
      from public.run_sessions s
      join public.run_series r on r.id = s.run_series_id
     where s.id = p_target_id;
  elsif p_target_kind = 'profile' then
    select p.id, p.display_name into v_target_user, v_snapshot
      from public.profiles p where p.id = p_target_id;
  end if;

  if v_target_user is null then
    raise exception 'That content is no longer available.' using errcode = 'P0002';
  end if;
  if v_target_user = v_user then
    raise exception 'You cannot report your own content.' using errcode = '22023';
  end if;
  if (select count(*) from public.content_reports r
       where r.reporter_id = v_user and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have sent many reports today. Try again tomorrow.' using errcode = '22023';
  end if;

  insert into public.content_reports (
    reporter_id, target_kind, target_id, target_user_id, reason, details, content_snapshot
  ) values (
    v_user, p_target_kind, p_target_id, v_target_user, p_reason, v_details, left(v_snapshot, 1000)
  )
  on conflict (reporter_id, target_kind, target_id) where status = 'open' do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id from public.content_reports r
     where r.reporter_id = v_user and r.target_kind = p_target_kind
       and r.target_id = p_target_id and r.status = 'open';
  end if;
  return v_id;
end;
$$;

revoke all on function public.report_content(public.report_target, uuid, public.report_reason, text)
  from public, anon;
grant execute on function public.report_content(public.report_target, uuid, public.report_reason, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Admin resolution
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: moderated tables have no admin write policies, and removing
-- another player's post, message, session or name is exactly what clients must
-- not be able to do. The function checks is_admin() first, resolves every open
-- report on the target together, and records the decision in admin_audit_log.
--
-- `remove` takes the content down:
--   session_post     the post and its media rows are deleted; the media storage
--                    paths are returned so the admin client can delete the files
--                    through the Storage API
--   session_message  the message is deleted
--   run_session      the series is marked removed, which hides it from
--                    discovery, and its unfinished occurrences are cancelled
--                    with their title overrides cleared
--   profile          the display name is reset and any avatar path cleared
-- `dismiss` leaves the content in place.
create function public.admin_resolve_reports(
  p_target_kind public.report_target,
  p_target_id uuid,
  p_action text,
  p_note text default null
) returns table (storage_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(btrim(p_note), '');
  v_paths text[] := '{}';
  v_series uuid;
  v_resolved integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('remove', 'dismiss') then
    raise exception 'Invalid moderation decision' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Moderation note is too long' using errcode = '22023';
  end if;

  -- Locking the open reports serializes two moderators acting on one target.
  perform 1 from public.content_reports r
   where r.target_kind = p_target_kind and r.target_id = p_target_id and r.status = 'open'
   for update;
  if not found then
    raise exception 'There are no open reports for this content' using errcode = '22023';
  end if;

  if p_action = 'remove' then
    if p_target_kind = 'session_post' then
      select coalesce(array_agg(m.storage_path order by m.storage_path)
                        filter (where m.storage_path is not null), '{}')
        into v_paths
        from public.session_media m where m.post_id = p_target_id;
      delete from public.session_posts where id = p_target_id;
    elsif p_target_kind = 'session_message' then
      delete from public.session_messages where id = p_target_id;
    elsif p_target_kind = 'run_session' then
      select s.run_series_id into v_series from public.run_sessions s where s.id = p_target_id;
      if v_series is not null then
        update public.run_series set status = 'removed' where id = v_series;
        update public.run_sessions
           set title = null, cancelled_at = coalesce(cancelled_at, now())
         where run_series_id = v_series and ends_at > now();
      end if;
    elsif p_target_kind = 'profile' then
      update public.profiles set display_name = 'Drop In player', avatar_path = null
       where id = p_target_id;
    end if;
  end if;

  update public.content_reports
     set status = (case p_action when 'remove' then 'actioned' else 'dismissed' end)::public.report_status,
         resolved_at = now(), resolved_by = auth.uid(), resolution_note = v_note
   where target_kind = p_target_kind and target_id = p_target_id and status = 'open';
  get diagnostics v_resolved = row_count;

  insert into public.admin_audit_log (actor_id, action, entity_id, details)
  values (auth.uid(), 'report.' || p_action, p_target_id, jsonb_build_object(
    'target_kind', p_target_kind, 'reports_resolved', v_resolved,
    'note', v_note, 'media_paths', to_jsonb(v_paths)));

  return query select unnest(v_paths);
end;
$$;

revoke all on function public.admin_resolve_reports(public.report_target, uuid, text, text)
  from public, anon;
grant execute on function public.admin_resolve_reports(public.report_target, uuid, text, text)
  to authenticated;

-- Take-down deletes a removed post's files through the Storage API with the
-- admin's own session. Storage's remove API needs SELECT as well as DELETE.
create policy session_media_objects_select_admin on storage.objects
  for select to authenticated using (bucket_id = 'session-media' and public.is_admin());
create policy session_media_objects_delete_admin on storage.objects
  for delete to authenticated using (bucket_id = 'session-media' and public.is_admin());
