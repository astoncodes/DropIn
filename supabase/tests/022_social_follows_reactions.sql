-- Follows, reactions, player profiles and following_live
-- (20261117120000_social_follows_reactions.sql): the follower, the followed,
-- a third player, a blocked pair and anon.
begin;
select plan(33);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-4111-8111-111111111117', 'authenticated', 'authenticated', 'social-one@example.test', '{"display_name":"Social One"}'),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-4222-8222-222222222227', 'authenticated', 'authenticated', 'social-two@example.test', '{"display_name":"Social Two"}'),
  ('00000000-0000-0000-0000-000000000000', 'b3333333-3333-4333-8333-333333333337', 'authenticated', 'authenticated', 'social-three@example.test', '{"display_name":"Social Three"}');
select set_config('test.sport', (select id::text from public.sports where is_active order by id limit 1), true);
insert into public.venues (id, region_id, name, location, address_text, indoor_state, verification_state)
select 'b4000000-0000-4000-8000-0000000000b1', r.id, 'Social test court',
       extensions.st_setsrid(extensions.st_makepoint(-63.13, 46.24), 4326)::extensions.geography,
       '1 Social Street', 'outdoor', 'admin_verified'
  from public.regions r where r.is_published order by r.id limit 1;
insert into public.venue_sports (venue_id, sport_id)
  values ('b4000000-0000-4000-8000-0000000000b1', current_setting('test.sport')::bigint);
insert into public.profile_sports (profile_id, sport_id)
  values ('b2222222-2222-4222-8222-222222222227', current_setting('test.sport')::bigint);
-- Two is at the court now; Three played there last week.
insert into public.check_ins (user_id, venue_id, region_id, sport_id, started_at, expires_at, location_verified)
select 'b2222222-2222-4222-8222-222222222227', v.id, v.region_id, current_setting('test.sport')::bigint,
       now() - interval '5 minutes', now() + interval '55 minutes', true
  from public.venues v where v.id = 'b4000000-0000-4000-8000-0000000000b1';
insert into public.check_ins (user_id, venue_id, region_id, sport_id, started_at, expires_at, ended_at, end_reason, location_verified)
select 'b3333333-3333-4333-8333-333333333337', v.id, v.region_id, current_setting('test.sport')::bigint,
       now() - interval '7 days', now() - interval '7 days' + interval '1 hour', now() - interval '7 days' + interval '1 hour', 'checkout', true
  from public.venues v where v.id = 'b4000000-0000-4000-8000-0000000000b1';

-- --- Anonymous ---------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.follows $$, '42501', null, 'anon cannot read follows');
select throws_ok($$ select * from public.player_profile('b2222222-2222-4222-8222-222222222227') $$, '42501', null, 'anon cannot open a player profile');
reset role;

-- --- One follows Two -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111117","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.follows (follower_id, followed_id) values ('b1111111-1111-4111-8111-111111111117', 'b1111111-1111-4111-8111-111111111117') $$,
  '23514', null, 'a player cannot follow themselves');
select throws_ok($$ insert into public.follows (follower_id, followed_id) values ('b3333333-3333-4333-8333-333333333337', 'b2222222-2222-4222-8222-222222222227') $$,
  '42501', null, 'a player cannot follow on someone else''s behalf');
select lives_ok($$ insert into public.follows (follower_id, followed_id) values ('b1111111-1111-4111-8111-111111111117', 'b2222222-2222-4222-8222-222222222227') $$,
  'a player follows another');
select is((select count(*)::integer from public.follows), 1, 'the follower sees the follow');

select is((select display_name from public.player_profile('b2222222-2222-4222-8222-222222222227')), 'Social Two', 'a player profile opens by id');
select is((select sport_slugs from public.player_profile('b2222222-2222-4222-8222-222222222227')),
  (select array[slug] from public.sports where id = current_setting('test.sport')::bigint), 'the profile lists the player''s sports');
select is((select followers from public.player_profile('b2222222-2222-4222-8222-222222222227')), 1, 'followers are counted');
select ok((select is_following from public.player_profile('b2222222-2222-4222-8222-222222222227')), 'the caller sees that they follow');
select ok(not (select follows_you from public.player_profile('b2222222-2222-4222-8222-222222222227')), 'and that they are not followed back');
select is((select check_in_count from public.player_profile('b2222222-2222-4222-8222-222222222227')), 1, 'check-ins are counted');
select is((select live_venue_name from public.player_profile('b2222222-2222-4222-8222-222222222227')), 'Social test court', 'an active check-in names the venue');
select is((select live_venue_name from public.player_profile('b3333333-3333-4333-8333-333333333337')), null, 'a finished check-in does not');
select is((select venue_count from public.player_profile('b3333333-3333-4333-8333-333333333337')), 1, 'but it still counts as a venue played at');
select is((select count(*)::integer from public.profile_sports where profile_id = 'b2222222-2222-4222-8222-222222222227'), 0,
  'the profile summary does not expose another player''s sport rows');

select is((select array_agg(display_name) from public.following_live()), array['Social Two'], 'following_live lists followed players who are checked in');
select is((select venue_name from public.following_live()), 'Social test court', 'with the venue they are at');
reset role;

-- --- Two sees the follow, Three does not --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222227","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.follows), 1, 'the followed player sees who follows them');
select ok((select follows_you from public.player_profile('b1111111-1111-4111-8111-111111111117')), 'and sees it on the follower''s profile');
select is((select count(*)::integer from public.following_live()), 0, 'nobody they follow is playing');
reset role;
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333337","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.follows), 0, 'a third player sees neither side of the follow');
select is((select followers from public.player_profile('b2222222-2222-4222-8222-222222222227')), 1, 'but the count is public');
reset role;

-- --- Blocking ends and prevents follows ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222227","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id) values ('b2222222-2222-4222-8222-222222222227', 'b1111111-1111-4111-8111-111111111117');
select is((select count(*)::integer from public.follows), 0, 'blocking removes the existing follow');
reset role;
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111117","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.follows (follower_id, followed_id) values ('b1111111-1111-4111-8111-111111111117', 'b2222222-2222-4222-8222-222222222227') $$,
  '42501', null, 'a blocked player cannot follow the blocker');
select is((select count(*)::integer from public.player_profile('b2222222-2222-4222-8222-222222222227')), 0, 'nor open their profile');
reset role;

-- --- Reactions -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333337","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.session', public.create_run_at_pin(
  46.24, -63.13, 'Social test spot', current_setting('test.sport')::bigint,
  current_date + 1, '18:00', '20:00', 1, 'Social test run', 'UTC')::text, true);
select set_config('test.post', public.create_session_photo_post(s.id, 'Three''s post', s.latitude, s.longitude, 10, now())::text, true)
  from public.run_sessions s where s.id = current_setting('test.session')::uuid;
reset role;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222227","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.post_reactions (post_id, user_id) values (current_setting('test.post')::uuid, 'b2222222-2222-4222-8222-222222222227') $$,
  'a player reacts to a moment');
select throws_ok($$ insert into public.post_reactions (post_id, user_id) values (current_setting('test.post')::uuid, 'b1111111-1111-4111-8111-111111111117') $$,
  '42501', null, 'not on someone else''s behalf');
select is((select reactions from public.post_reaction_counts(array[current_setting('test.post')::uuid])), 1, 'reactions are counted');
select ok((select reacted from public.post_reaction_counts(array[current_setting('test.post')::uuid])), 'and the caller''s own is marked');
reset role;
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333337","role":"authenticated"}', true);
set local role authenticated;
select ok(not (select reacted from public.post_reaction_counts(array[current_setting('test.post')::uuid])), 'another viewer sees the count without a mark');
select lives_ok($$ delete from public.post_reactions where post_id = current_setting('test.post')::uuid $$, 'deleting another player''s reaction is allowed to run');
select is((select reactions from public.post_reaction_counts(array[current_setting('test.post')::uuid])), 1, 'the reaction is still there');
reset role;

select * from finish();
rollback;
