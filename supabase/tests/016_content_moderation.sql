-- Reports, blocks and admin take-down (20260926120000_content_moderation.sql),
-- from the author, a reporting member, an outsider, an admin and anon.
begin;
select plan(46);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111116', 'authenticated', 'authenticated', 'mod-author@example.test', '{"display_name":"Mod Author"}'),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222226', 'authenticated', 'authenticated', 'mod-reporter@example.test', '{"display_name":"Mod Reporter"}'),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333336', 'authenticated', 'authenticated', 'mod-outsider@example.test', '{"display_name":"Mod Outsider"}'),
  ('00000000-0000-0000-0000-000000000000', 'a4444444-4444-4444-8444-444444444446', 'authenticated', 'authenticated', 'mod-admin@example.test', '{"display_name":"Mod Admin"}');
insert into public.admin_users (user_id, note) values ('a4444444-4444-4444-8444-444444444446', 'moderation fixture');

select has_table('public', 'user_blocks', 'players can block other players');
select has_table('public', 'content_reports', 'players can report content');

-- The author hosts a session tomorrow, posts a photo, and writes in chat.
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111116","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.session', public.create_run_at_pin(
  46.24, -63.13, 'Moderation test court', (select id from public.sports where is_active limit 1),
  current_date + 1, '18:00', '20:00', 1, 'Moderation test run', 'UTC'
)::text, true);
select set_config('test.post', public.create_session_photo_post(s.id, 'Author post',
  s.latitude, s.longitude, 10, now())::text, true)
  from public.run_sessions s where s.id = current_setting('test.session')::uuid;
select set_config('test.path', 'a1111111-1111-4111-8111-111111111116/' || current_setting('test.post') || '/photo.jpg', true);
insert into storage.objects (bucket_id, name, owner_id)
  values ('session-media', current_setting('test.path'), 'a1111111-1111-4111-8111-111111111116');
insert into public.session_media (post_id, uploader_id, kind, storage_path)
  values (current_setting('test.post')::uuid, 'a1111111-1111-4111-8111-111111111116', 'image', current_setting('test.path'));
insert into public.session_messages (session_id, user_id, body)
  values (current_setting('test.session')::uuid, 'a1111111-1111-4111-8111-111111111116', 'Author message');
select set_config('test.message', (select id::text from public.session_messages
  where user_id = 'a1111111-1111-4111-8111-111111111116' limit 1), true);

select throws_ok(
  $$ insert into public.session_media (post_id, uploader_id, kind, remote_url)
     values (current_setting('test.post')::uuid, 'a1111111-1111-4111-8111-111111111116', 'image', 'https://example.test/elsewhere.jpg') $$,
  '42501', null, 'players cannot register media hosted outside Drop In storage');
select throws_ok(
  $$ select public.report_content('session_post', current_setting('test.post')::uuid, 'spam') $$,
  '22023', null, 'authors cannot report their own content');
reset role;

-- The reporter joins, so they can see chat.
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222226","role":"authenticated"}', true);
set local role authenticated;
select public.join_run_session(r.run_series_id, r.occurrence_date)
  from public.run_sessions r where r.id = current_setting('test.session')::uuid;

select is((select count(*)::int from public.session_posts where author_id = 'a1111111-1111-4111-8111-111111111116'), 1,
  'a member sees the author post before blocking');
select lives_ok(
  $$ insert into public.user_blocks (blocker_id, blocked_id)
     values ('a2222222-2222-4222-8222-222222222226', 'a1111111-1111-4111-8111-111111111116') $$,
  'a player can block another player');
select is_empty($$ select 1 from public.session_posts where author_id = 'a1111111-1111-4111-8111-111111111116' $$,
  'a blocked player''s posts are hidden from the blocker');
select is_empty($$ select 1 from public.session_media where uploader_id = 'a1111111-1111-4111-8111-111111111116' $$,
  'a blocked player''s media is hidden from the blocker');
select is_empty($$ select 1 from public.session_messages where user_id = 'a1111111-1111-4111-8111-111111111116' $$,
  'a blocked player''s chat messages are hidden from the blocker');
select throws_ok(
  $$ insert into public.user_blocks (blocker_id, blocked_id)
     values ('a3333333-3333-4333-8333-333333333336', 'a1111111-1111-4111-8111-111111111116') $$,
  '42501', null, 'a player cannot create a block on someone else''s behalf');
select throws_ok(
  $$ insert into public.user_blocks (blocker_id, blocked_id)
     values ('a2222222-2222-4222-8222-222222222226', 'a2222222-2222-4222-8222-222222222226') $$,
  '23514', null, 'a player cannot block themselves');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333336","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$ select 1 from public.user_blocks $$, 'blocks are private to the blocker');
select is((select count(*)::int from public.session_posts where author_id = 'a1111111-1111-4111-8111-111111111116'), 1,
  'someone else''s block does not hide the post from other players');
select throws_ok(
  $$ select public.report_content('session_message', current_setting('test.message')::uuid, 'harassment') $$,
  'P0002', null, 'a non-member cannot report chat they cannot read');
reset role;

set local role anon;
select throws_ok($$ select * from public.session_posts $$,
  '42501', null, 'signed-out readers cannot see posts');
select ok(not has_function_privilege('anon', 'public.report_content(public.report_target,uuid,public.report_reason,text)', 'EXECUTE'),
  'signed-out readers cannot file reports');
select ok(not has_function_privilege('anon', 'public.admin_resolve_reports(public.report_target,uuid,text,text)', 'EXECUTE'),
  'signed-out readers cannot resolve reports');
select ok(not has_function_privilege('anon', 'public.is_blocked_by_viewer(uuid)', 'EXECUTE'),
  'signed-out readers cannot call the block helper');
reset role;

-- The reporter unblocks, then reports each kind of content.
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222226","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ delete from public.user_blocks where blocked_id = 'a1111111-1111-4111-8111-111111111116' $$,
  'a player can unblock');
select is((select count(*)::int from public.session_messages where user_id = 'a1111111-1111-4111-8111-111111111116'), 1,
  'unblocking restores the player''s messages');
select lives_ok(
  $$ select set_config('test.report_post', public.report_content('session_post',
       current_setting('test.post')::uuid, 'sexual_content', '  Explicit photo  ')::text, true) $$,
  'a player can report a public post');
select is(public.report_content('session_post', current_setting('test.post')::uuid, 'spam'),
  current_setting('test.report_post')::uuid,
  'reporting the same content again reuses the open report');
select lives_ok(
  $$ select public.report_content('session_message', current_setting('test.message')::uuid, 'harassment') $$,
  'a member can report a chat message');
select lives_ok(
  $$ select public.report_content('run_session', current_setting('test.session')::uuid, 'hate') $$,
  'a player can report a session');
select lives_ok(
  $$ select public.report_content('profile', 'a1111111-1111-4111-8111-111111111116', 'impersonation') $$,
  'a player can report a profile');
select throws_ok(
  $$ select public.report_content('profile', 'a1111111-1111-4111-8111-111111111116', 'other', repeat('x', 501)) $$,
  '22023', null, 'report details are capped at 500 characters');
select throws_ok(
  $$ select public.report_content('session_post', gen_random_uuid(), 'spam') $$,
  'P0002', null, 'reporting content that does not exist fails cleanly');
select is_empty($$ select 1 from public.content_reports $$, 'reporters cannot read the moderation queue');
select throws_ok(
  $$ select * from public.admin_resolve_reports('session_post', current_setting('test.post')::uuid, 'remove') $$,
  '42501', null, 'only admins can resolve reports');
reset role;

select results_eq(
  $$ select target_user_id::text, content_snapshot, details from public.content_reports
      where id = current_setting('test.report_post')::uuid $$,
  $$ values ('a1111111-1111-4111-8111-111111111116', 'Author post', 'Explicit photo') $$,
  'a report records the author, what the reporter saw, and trimmed details');

-- The admin works the queue.
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444446","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::int from public.content_reports
            where target_user_id = 'a1111111-1111-4111-8111-111111111116' and status = 'open'), 4,
  'admins read every open report');
select throws_ok(
  $$ select * from public.admin_resolve_reports('session_post', current_setting('test.post')::uuid, 'delete') $$,
  '22023', null, 'unknown moderation decisions are rejected');
select lives_ok(
  $$ select * from public.admin_resolve_reports('session_message', current_setting('test.message')::uuid, 'dismiss', 'Banter') $$,
  'an admin can dismiss reports and keep the content');
select throws_ok(
  $$ select * from public.admin_resolve_reports('session_message', current_setting('test.message')::uuid, 'remove') $$,
  '22023', null, 'resolved reports cannot be resolved twice');
select results_eq(
  $$ select * from public.admin_resolve_reports('session_post', current_setting('test.post')::uuid, 'remove', 'Explicit') $$,
  format($$ values (%L::text) $$, current_setting('test.path')),
  'removing a post returns its media paths for storage clean-up');
select is((select count(*)::int from storage.objects where name = current_setting('test.path')), 1,
  'admins can see a removed post''s files');
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = current_setting('test.path');
select is((select count(*)::int from storage.objects where name = current_setting('test.path')), 0,
  'admins can delete a removed post''s files');
select lives_ok(
  $$ select * from public.admin_resolve_reports('run_session', current_setting('test.session')::uuid, 'remove') $$,
  'an admin can take down a session');
select lives_ok(
  $$ select * from public.admin_resolve_reports('profile', 'a1111111-1111-4111-8111-111111111116', 'remove') $$,
  'an admin can reset an offensive display name');
reset role;

select is_empty($$ select 1 from public.session_posts where id = current_setting('test.post')::uuid $$,
  'the removed post is gone');
select is_empty($$ select 1 from public.session_media where post_id = current_setting('test.post')::uuid $$,
  'the removed post''s media rows are gone');
select isnt_empty($$ select 1 from public.session_messages where id = current_setting('test.message')::uuid $$,
  'a dismissed message stays');
select results_eq(
  $$ select target_kind::text, status::text from public.content_reports
      where target_user_id = 'a1111111-1111-4111-8111-111111111116' order by target_kind $$,
  $$ values ('profile', 'actioned'), ('run_session', 'actioned'),
            ('session_message', 'dismissed'), ('session_post', 'actioned') $$,
  'every report on each target is resolved with the decision');
select results_eq(
  $$ select r.status::text, s.cancelled_at is not null from public.run_sessions s
       join public.run_series r on r.id = s.run_series_id
      where s.id = current_setting('test.session')::uuid $$,
  $$ values ('removed', true) $$,
  'a taken-down session leaves discovery and its occurrence is cancelled');
select is((select display_name from public.profiles where id = 'a1111111-1111-4111-8111-111111111116'),
  'Drop In player', 'a reset profile shows a neutral name');
select is((select count(*)::int from public.admin_audit_log
            where actor_id = 'a4444444-4444-4444-8444-444444444446' and action like 'report.%'), 4,
  'every moderation decision is audited');

select * from finish();
rollback;
