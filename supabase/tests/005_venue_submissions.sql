-- User venue submissions: final coordinates are stored privately, duplicate
-- checks propose only, and direct client writes cannot bypass submit_venue().

begin;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '71111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'submitter@example.test'),
  ('00000000-0000-0000-0000-000000000000', '72222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'other@example.test'),
  ('00000000-0000-0000-0000-000000000000', '73333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'reviewer@example.test');

insert into public.admin_users (user_id, note)
values ('73333333-3333-4333-8333-333333333333', 'submission test admin');

set local role anon;

select throws_ok(
  $$ select * from public.submit_venue(
       'Anonymous court', 46.2700, -63.2000,
       array[(select id from public.sports where slug = 'basketball')],
       'outdoor', null
     ) $$,
  '42501',
  null,
  'anonymous callers cannot submit venues'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '71111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select * from public.submit_venue(
       'Northwest Test Court', 46.2900, -63.2200,
       array[(select id from public.sports where slug = 'basketball')],
       'outdoor', '100 Test Road'
     ) $$,
  'an authenticated player can submit a venue in a published region'
);

select is(
  (select count(*)::integer from public.venue_candidates),
  1,
  'the submitter can read their own candidate'
);

select is(
  (select status::text from public.venue_candidates where proposed_name = 'Northwest Test Court'),
  'pending',
  'a submission without a nearby match starts pending'
);

select is(
  (select round(extensions.ST_Y(location::extensions.geometry)::numeric, 4)
     from public.venue_candidates where proposed_name = 'Northwest Test Court'),
  46.2900::numeric,
  'the final confirmed latitude is stored in PostGIS'
);

select is(
  (select round(extensions.ST_X(location::extensions.geometry)::numeric, 4)
     from public.venue_candidates where proposed_name = 'Northwest Test Court'),
  (-63.2200)::numeric,
  'the final confirmed longitude is stored in PostGIS'
);

select is(
  (select count(*)::integer
     from public.venue_candidate_sports cs
     join public.venue_candidates c on c.id = cs.candidate_id
    where c.proposed_name = 'Northwest Test Court'),
  1,
  'selected sports are stored with the candidate'
);

select throws_ok(
  $$ insert into public.venue_candidates (
       region_id, submitted_by, proposed_name, location, indoor_state
     )
     select r.id, '71111111-1111-4111-8111-111111111111', 'Bypass',
            extensions.ST_SetSRID(extensions.ST_MakePoint(-63.2, 46.27), 4326)::extensions.geography,
            'outdoor'
       from public.regions r where r.slug = 'charlottetown' $$,
  '42501',
  null,
  'players cannot bypass the RPC with a direct insert'
);

select lives_ok(
  $$ select * from public.submit_venue(
       'Victoria Park Basketball', 46.2294, -63.1372,
       array[(select id from public.sports where slug = 'basketball')],
       'outdoor', 'Victoria Park'
     ) $$,
  'a nearby submission is accepted into moderation rather than rejected or merged'
);

select is(
  (select status::text from public.venue_candidates where proposed_name = 'Victoria Park Basketball'),
  'possible_duplicate',
  'a nearby submission is flagged as a possible duplicate'
);

select isnt(
  (select duplicate_of_venue_id from public.venue_candidates where proposed_name = 'Victoria Park Basketball'),
  null,
  'the best duplicate proposal is stored for review without merging'
);

select throws_ok(
  $$ select * from public.submit_venue(
       'Outside Region', 51.5072, -0.1276,
       array[(select id from public.sports where slug = 'basketball')],
       'outdoor', null
     ) $$,
  '22023',
  null,
  'coordinates outside a published region are rejected by the server'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '72222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is_empty(
  $$ select 1 from public.venue_candidates $$,
  'another player cannot see the submitter private candidates'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '73333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.venue_candidates),
  2,
  'an admin can see candidates awaiting review'
);

reset role;
select * from finish();
rollback;
