begin;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'organizer@example.test', '{"display_name":"Organizer"}'),
  ('00000000-0000-0000-0000-000000000000', '91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'member@example.test', '{"display_name":"Member"}'),
  ('00000000-0000-0000-0000-000000000000', '92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'outsider@example.test', '{"display_name":"Outsider"}');

select has_table('public', 'run_sessions', 'dated sessions exist');
select has_table('public', 'session_memberships', 'session memberships exist');
select has_table('public', 'session_messages', 'private messages exist');
select has_table('public', 'session_posts', 'public session posts exist');
select has_table('public', 'session_media', 'post media exists');

-- Host a run for tomorrow rather than joining a seeded one. The hosted test
-- project keeps its fixtures, so seeded series expire weeks after loading.
select set_config('request.jwt.claims', json_build_object('sub', '90000000-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.hosted_session_id', public.create_run_at_pin(
  46.24, -63.13, 'Social test court', (select id from public.sports where is_active limit 1),
  current_date + 1, '18:00', '20:00', 1, 'Social test run', 'UTC'
)::text, true);
select set_config('test.series', (select run_series_id::text from public.run_sessions where id = current_setting('test.hosted_session_id')::uuid), true);
select set_config('test.date', (select occurrence_date::text from public.run_sessions where id = current_setting('test.hosted_session_id')::uuid), true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '91111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select set_config(
       'test.joined_session_id',
       public.join_run_session(current_setting('test.series')::uuid, current_setting('test.date')::date)::text,
       true
     ) $$,
  'an authenticated player can join a valid dated occurrence'
);

select is(
  (select count(*)::integer from public.session_memberships
    where session_id = current_setting('test.joined_session_id')::uuid),
  2,
  'the joining player can see every member of the session they joined'
);

select lives_ok(
  $$ insert into public.session_messages (session_id, user_id, body)
     values (current_setting('test.joined_session_id')::uuid,
             '91111111-1111-4111-8111-111111111111', 'See you there') $$,
  'a member can send a session message'
);

select lives_ok(
  $$ select public.create_session_photo_post(s.id, 'Great run tonight', s.latitude, s.longitude, 10, now())
       from public.run_sessions s
       where s.id = current_setting('test.joined_session_id')::uuid $$,
  'a nearby member can publish a feed post'
);

select throws_ok(
  $$ insert into public.session_media (post_id, uploader_id, kind, storage_path, duration_seconds)
     select id, '91111111-1111-4111-8111-111111111111', 'video', 'test/long.mp4', 31
       from public.session_posts
      where author_id = '91111111-1111-4111-8111-111111111111' limit 1 $$,
  '23514', null, 'clips are capped at thirty seconds'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '92222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty($$ select 1 from public.session_messages $$,
  'a non-member cannot read session chat');

select throws_ok(
  $$ insert into public.session_messages (session_id, user_id, body)
     values (current_setting('test.joined_session_id')::uuid,
             '92222222-2222-4222-8222-222222222222', 'Let me in') $$,
  '42501', null, 'a non-member cannot write session chat'
);

select is((select count(*)::integer from public.session_posts), 4,
  'public feed posts remain visible to a non-member');

reset role;
set local role anon;
select is((select count(*)::integer from public.session_posts), 4,
  'public feed posts are visible without an account');
select throws_ok(
  $$ select public.join_run_session(current_setting('test.series')::uuid, current_setting('test.date')::date) $$,
  '42501', null, 'anonymous users cannot join sessions'
);

reset role;
select * from finish();
rollback;
