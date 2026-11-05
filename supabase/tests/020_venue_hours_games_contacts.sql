begin;
select plan(54);

-- Players p1–p8 and an admin, used only by this file.
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('c2000000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'venue-hours-' || n || '@example.test'
  from generate_series(1, 8) n;
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-0000000000ad',
   'authenticated', 'authenticated', 'venue-hours-admin@example.test');
insert into public.admin_users (user_id) values ('c2000000-0000-4000-8000-0000000000ad');

insert into public.venues (id, region_id, name, location, status)
select v.id::uuid, r.id, v.name,
       extensions.st_setsrid(extensions.st_makepoint(v.lon, v.lat), 4326)::extensions.geography,
       v.status::public.venue_status
  from (values
    ('c2000000-0000-4000-8000-0000000000b1', 'Game court',    -63.20, 46.20, 'active'),
    ('c2000000-0000-4000-8000-0000000000b2', 'Solo court',    -63.19, 46.20, 'active'),
    ('c2000000-0000-4000-8000-0000000000b3', 'Hours court',   -63.18, 46.20, 'active'),
    ('c2000000-0000-4000-8000-0000000000b4', 'Night court',   -63.17, 46.20, 'active'),
    ('c2000000-0000-4000-8000-0000000000b5', 'Closed court',  -63.13, 46.24, 'active'),
    ('c2000000-0000-4000-8000-0000000000b6', 'Removed court', -63.13, 46.24, 'removed'),
    ('c2000000-0000-4000-8000-0000000000b7', 'Contact court', -63.05, 46.29, 'active')
  ) v(id, name, lon, lat, status)
  cross join (select id from public.regions where slug = 'charlottetown') r;
insert into public.venue_sports (venue_id, sport_id)
select v.id, s.id from public.venues v, public.sports s
 where v.id::text like 'c2000000-0000-4000-8000-0000000000b%' and s.slug = 'basketball';
select set_config('test.sport', (select id::text from public.sports where slug = 'basketball'), true);

-- A wall-clock time in the venue's region, p_days_ago local days before today.
create function pg_temp.local_at(p_days_ago integer, p_hour integer, p_minute integer default 0,
                                 p_second integer default 0)
returns timestamptz language sql stable as $$
  select (((now() at time zone r.timezone)::date - p_days_ago)
          + make_time(p_hour, p_minute, p_second::double precision)) at time zone r.timezone
    from public.regions r where r.slug = 'charlottetown'
$$;

-- A finished visit, as if the player checked in and later checked out.
create function pg_temp.played(p_user text, p_venue text, p_start timestamptz, p_end timestamptz)
returns void language sql as $$
  insert into public.check_ins (user_id, venue_id, region_id, sport_id, started_at, expires_at,
                                ended_at, end_reason, location_verified)
  select p_user::uuid, v.id, v.region_id, current_setting('test.sport')::bigint,
         p_start, p_end, p_end, 'checkout', true
    from public.venues v where v.id = p_venue::uuid
$$;

create function pg_temp.hours(p_venue text) returns text language sql stable as $$
  select coalesce(h.open_from_hour::text, '-') || '-' || coalesce(h.open_until_hour::text, '-')
         || '/' || coalesce(h.open_player_count::text, '-')
    from public.venue_reported_hours(p_venue::uuid) h
$$;

-- ---------------------------------------------------------------------------
-- Schema: one presence check, no pulse, no "crowded"
-- ---------------------------------------------------------------------------

select has_function('private', 'venue_presence_distance',
  array['uuid', 'double precision', 'double precision', 'double precision', 'timestamp with time zone', 'text'],
  'Proof of presence has one implementation');
select hasnt_column('public', 'check_ins', 'pulse', 'Check-ins carry no pulse');
select hasnt_type('public', 'venue_pulse', 'The pulse type is gone');
select ok(not ('crowded' = any (enum_range(null::public.venue_condition_kind)::text[])),
  'Crowded is not a venue condition');

-- ---------------------------------------------------------------------------
-- Most until: when half the players present will have left
-- ---------------------------------------------------------------------------

insert into public.check_ins (user_id, venue_id, region_id, sport_id, party_size, started_at,
                              expires_at, location_verified)
select x.u::uuid, x.v::uuid, v.region_id, current_setting('test.sport')::bigint, x.p,
       now() - interval '10 minutes', now() + make_interval(mins => x.m), true
  from (values
    ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000b1', 1, 30),
    ('c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-0000000000b1', 1, 60),
    ('c2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-0000000000b1', 4, 90),
    ('c2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-0000000000b2', 2, 45)
  ) x(u, v, p, m)
  join public.venues v on v.id = x.v::uuid;

select is((select most_here_until from public.venue_details('c2000000-0000-4000-8000-0000000000b1')),
  now() + interval '90 minutes',
  'Most until is when half the players, counted by party size, have left: 2 of 6 by 60 min, all by 90');
select is((select most_here_until from public.venue_details('c2000000-0000-4000-8000-0000000000b2')),
  now() + interval '45 minutes', 'A lone party stays until its own expiry');
select ok((select most_here_until is null from public.venue_details('c2000000-0000-4000-8000-0000000000b3')),
  'Nobody checked in means no most-until time');

update public.check_ins set ended_at = now(), end_reason = 'checkout'
 where user_id::text like 'c2000000-0000-4000-8000-00000000000%' and ended_at is null;

-- ---------------------------------------------------------------------------
-- Reported hours
-- ---------------------------------------------------------------------------

select pg_temp.played('c2000000-0000-4000-8000-00000000000' || n, 'c2000000-0000-4000-8000-0000000000b3',
                      pg_temp.local_at(n, 18), pg_temp.local_at(n, 20))
  from generate_series(1, 4) n;
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b3'), '---/-',
  'Four players are not enough to show hours');

select pg_temp.played('c2000000-0000-4000-8000-000000000005', 'c2000000-0000-4000-8000-0000000000b3',
                      pg_temp.local_at(5, 18), pg_temp.local_at(5, 20));
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b3'), '18-20/5',
  'Five players show the hours they were there');

select pg_temp.played('c2000000-0000-4000-8000-000000000006', 'c2000000-0000-4000-8000-0000000000b3',
                      pg_temp.local_at(1, 3), pg_temp.local_at(1, 4));
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b3'), '18-20/6',
  'One player alone at 3am does not stretch the range');

select pg_temp.played('c2000000-0000-4000-8000-00000000000' || n, 'c2000000-0000-4000-8000-0000000000b3',
                      pg_temp.local_at(2, 21, 30), pg_temp.local_at(2, 21, 30, 5))
  from generate_series(7, 8) n;
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b3'), '18-22/8',
  'Instant checkout counts its hour');

select pg_temp.played('c2000000-0000-4000-8000-00000000000' || n, 'c2000000-0000-4000-8000-0000000000b3',
                      pg_temp.local_at(60, 6), pg_temp.local_at(60, 7))
  from generate_series(1, 2) n;
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b3'), '18-22/8',
  'Check-ins older than eight weeks are ignored');

select pg_temp.played('c2000000-0000-4000-8000-00000000000' || n, 'c2000000-0000-4000-8000-0000000000b4',
                      pg_temp.local_at(2, 21), pg_temp.local_at(1, 1))
  from generate_series(1, 2) n;
select pg_temp.played('c2000000-0000-4000-8000-00000000000' || n, 'c2000000-0000-4000-8000-0000000000b4',
                      pg_temp.local_at(1, 22), pg_temp.local_at(1, 23))
  from generate_series(3, 5) n;
select is(pg_temp.hours('c2000000-0000-4000-8000-0000000000b4'), '21-1/5',
  'Hours wrap past midnight');

select is_empty($$select * from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b6')$$,
  'Removed venue returns no row');

-- ---------------------------------------------------------------------------
-- Closed reports
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now())$$,
  '42501', null, 'Anonymous closed report denied');
reset role;

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 101, now())$$,
  '22023', null, 'Inaccurate reading rejected');
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now() - interval '3 minutes')$$,
  '22023', null, 'Stale reading rejected');
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now() + interval '1 minute')$$,
  '22023', null, 'Future reading rejected');
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 47, -63.13, 10, now())$$,
  '22023', null, 'Distant report rejected');
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b6', 46.24, -63.13, 10, now())$$,
  '22023', null, 'Removed venue rejects report');

select set_config('test.checkin', public.create_check_in('c2000000-0000-4000-8000-0000000000b5',
  current_setting('test.sport')::bigint, 46.24, -63.13, 10, now())::text, true);
select set_config('test.report', coalesce(public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5',
  46.24, -63.13, 10, now())::text, ''), true);
select isnt(current_setting('test.report'), '', 'A player at the venue can report it closed');
select is((select end_reason::text from public.check_ins where id = current_setting('test.checkin')::uuid),
  'checkout', 'Reporting closed ends the reporter''s check-in there');
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now())$$,
  '22023', 'You reported this venue closed in the last hour.', 'One closed report per player per venue per hour');
reset role;
update public.venue_closed_reports set reported_at = now() - interval '59 minutes'
 where id = current_setting('test.report')::uuid;
set local role authenticated;
select throws_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now())$$,
  '22023', 'You reported this venue closed in the last hour.', 'A report 59 minutes old still blocks another');
reset role;
update public.venue_closed_reports set reported_at = now() - interval '61 minutes'
 where id = current_setting('test.report')::uuid;
set local role authenticated;
select lives_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 10, now())$$,
  'A player can report the venue closed again after an hour');
select throws_ok($$insert into public.venue_closed_reports (venue_id, user_id, distance_to_venue_m, reported_accuracy_m)
  values ('c2000000-0000-4000-8000-0000000000b5', auth.uid(), 0, 10)$$,
  '42501', null, 'Direct closed-report writes are denied');

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.report_venue_closed('c2000000-0000-4000-8000-0000000000b5', 46.24, -63.13, 12, now())$$,
  'A second player can report the same venue closed');
reset role;
select set_config('request.jwt.claims', '', true);

select is(array(select column_name::text from information_schema.columns
                 where table_schema = 'public' and table_name = 'venue_closed_reports'
                 order by ordinal_position),
  array['id', 'venue_id', 'user_id', 'reported_at', 'distance_to_venue_m', 'reported_accuracy_m'],
  'A closed report keeps the proximity verdict, never a coordinate');
select ok((select distance_to_venue_m = 0 and reported_accuracy_m = 10 from public.venue_closed_reports
            where id = current_setting('test.report')::uuid),
  'A closed report records distance and accuracy');

update public.check_ins set started_at = now() - interval '40 minutes'
 where id = current_setting('test.checkin')::uuid;
update public.venue_closed_reports set reported_at = now() - interval '30 minutes'
 where venue_id = 'c2000000-0000-4000-8000-0000000000b5';
select is((select last_closed_player_count || '/' || closed_now
             from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b5')),
  '2/true', 'A fresh closed report counts its players and shows as closed now');
select is((select last_closed_at from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b5')),
  now() - interval '30 minutes', 'The latest closed report time is returned');

insert into public.check_ins (user_id, venue_id, region_id, sport_id, started_at, expires_at, location_verified)
select 'c2000000-0000-4000-8000-000000000003', v.id, v.region_id, current_setting('test.sport')::bigint,
       now() - interval '10 minutes', now() + interval '1 hour', true
  from public.venues v where v.id = 'c2000000-0000-4000-8000-0000000000b5';
select ok((select not closed_now from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b5')),
  'A check-in after the report shows the venue reopened');

delete from public.check_ins where user_id = 'c2000000-0000-4000-8000-000000000003' and ended_at is null;
-- Earlier than every report below, so only the report's age decides closed_now.
update public.check_ins set started_at = now() - interval '150 minutes', expires_at = now() - interval '30 minutes'
 where id = current_setting('test.checkin')::uuid;
update public.venue_closed_reports set reported_at = now() - interval '119 minutes'
 where venue_id = 'c2000000-0000-4000-8000-0000000000b5';
select ok((select closed_now from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b5')),
  'A closed report still shows just inside two hours');
update public.venue_closed_reports set reported_at = now() - interval '121 minutes'
 where venue_id = 'c2000000-0000-4000-8000-0000000000b5';
select ok((select not closed_now from public.venue_reported_hours('c2000000-0000-4000-8000-0000000000b5')),
  'The closed-now notice lapses after two hours');

select ok(has_function_privilege('anon', 'public.venue_reported_hours(uuid)', 'EXECUTE'),
  'Signed-out players can read reported hours');
select ok(not has_function_privilege('anon',
  'public.report_venue_closed(uuid,double precision,double precision,double precision,timestamp with time zone)', 'EXECUTE'),
  'Signed-out players cannot report a venue closed');

delete from auth.users where id = 'c2000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.venue_closed_reports
            where user_id = 'c2000000-0000-4000-8000-000000000002'), 0,
  'Deleting an account deletes its closed reports');

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.c1', (select candidate_id::text from public.submit_venue('Phone court', 46.25, -63.10,
  array[current_setting('test.sport')::bigint], 'outdoor', null, '+1 (902) 555-0100', 'https://contact.ca')), true);
select is((select phone || ' ' || website from public.venue_candidates where id = current_setting('test.c1')::uuid),
  '+1 (902) 555-0100 https://contact.ca', 'A submission keeps its phone and website');
select throws_ok($$select public.submit_venue('Bad court', 46.25, -63.10, array[current_setting('test.sport')::bigint], 'outdoor', null, '-------')$$,
  '22023', null, 'A phone without digits is rejected');
select throws_ok($$select public.submit_venue('Bad court', 46.25, -63.10, array[current_setting('test.sport')::bigint], 'outdoor', null, '12345')$$,
  '22023', null, 'A phone with too few digits is rejected');
select throws_ok($$select public.submit_venue('Bad court', 46.25, -63.10, array[current_setting('test.sport')::bigint], 'outdoor', null, 'call me maybe')$$,
  '22023', null, 'A phone with letters is rejected');
select throws_ok($$select public.submit_venue('Bad court', 46.25, -63.10, array[current_setting('test.sport')::bigint], 'outdoor', null, null, 'http://x.com')$$,
  '22023', null, 'A website without https is rejected');
select throws_ok($$select public.submit_venue('Bad court', 46.25, -63.10, array[current_setting('test.sport')::bigint], 'outdoor', null, null, 'https://example.com/' || repeat('a', 190))$$,
  '22023', null, 'A website over 200 characters is rejected');
select set_config('test.c2', (select candidate_id::text from public.submit_venue('Trimmed court', 46.26, -63.11,
  array[current_setting('test.sport')::bigint], 'outdoor', null, '  ', ' https://a.ca ')), true);
select is((select coalesce(phone, '<none>') || ' ' || website from public.venue_candidates
            where id = current_setting('test.c2')::uuid),
  '<none> https://a.ca', 'Trims and nulls blank contacts');
reset role;

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-0000000000ad","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select set_config('test.v1', public.admin_review_candidate(current_setting('test.c1')::uuid, 'approve')::text, true);
select is((select phone || ' ' || website from public.venues where id = current_setting('test.v1')::uuid),
  '+1 (902) 555-0100 https://contact.ca', 'Approval publishes the submitted contacts');
select set_config('test.v2', public.admin_review_candidate(current_setting('test.c2')::uuid, 'approve',
  null, null, null, '902 555 0101')::text, true);
select is((select phone from public.venues where id = current_setting('test.v2')::uuid),
  '902 555 0101', 'A reviewer can supply a phone on approval');
reset role;
select set_config('request.jwt.claims', '', true);

update public.venues set website = 'https://kept.ca' where id = 'c2000000-0000-4000-8000-0000000000b7';
insert into public.venue_candidates (id, region_id, submitted_by, proposed_name, location, indoor_state, phone, website)
select 'c2000000-0000-4000-8000-0000000000c3', r.id, 'c2000000-0000-4000-8000-000000000001', 'Contact court again',
       extensions.st_setsrid(extensions.st_makepoint(-63.05, 46.29), 4326)::extensions.geography,
       'outdoor', '902 555 0199', 'https://c3.ca'
  from public.regions r where r.slug = 'charlottetown';

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-0000000000ad","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select public.admin_review_candidate('c2000000-0000-4000-8000-0000000000c3', 'merge', 'Same court',
  'c2000000-0000-4000-8000-0000000000b7');
select is((select phone || ' ' || website from public.venues where id = 'c2000000-0000-4000-8000-0000000000b7'),
  '902 555 0199 https://kept.ca', 'Merging fills missing contacts and keeps reviewed ones');
select public.admin_update_venue('c2000000-0000-4000-8000-0000000000b7', 'Contact court', null, 'outdoor',
  'active', false, array[current_setting('test.sport')::bigint], ' 902-555-0123 ', 'https://new.ca');
select is((select phone || ' ' || website from public.venues where id = 'c2000000-0000-4000-8000-0000000000b7'),
  '902-555-0123 https://new.ca', 'An admin can set venue contacts');
select public.admin_update_venue('c2000000-0000-4000-8000-0000000000b7', 'Contact court', null, 'outdoor',
  'active', false, array[current_setting('test.sport')::bigint], null, '');
select ok((select phone is null and website is null from public.venues where id = 'c2000000-0000-4000-8000-0000000000b7'),
  'An admin can clear venue contacts');
select throws_ok($$select public.admin_update_venue('c2000000-0000-4000-8000-0000000000b7', 'Contact court', null, 'outdoor',
  'active', false, array[current_setting('test.sport')::bigint], 'call me maybe', null)$$,
  '22023', null, 'An admin cannot save an invalid phone');

select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-0000000000ad","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_update_venue('c2000000-0000-4000-8000-0000000000b7', 'Contact court', null, 'outdoor',
  'active', false, array[current_setting('test.sport')::bigint], '902 555 0100', null)$$,
  '42501', null, 'An admin without MFA cannot edit contacts');
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.admin_update_venue('c2000000-0000-4000-8000-0000000000b7', 'Contact court', null, 'outdoor',
  'active', false, array[current_setting('test.sport')::bigint], '902 555 0100', null)$$,
  '42501', null, 'A player cannot edit contacts');
select throws_ok($$update public.venues set phone = '902 555 0100' where id = 'c2000000-0000-4000-8000-0000000000b7'$$,
  '42501', null, 'Contacts cannot be written directly');
reset role;

set local role anon;
select is((select phone from public.venue_details(current_setting('test.v1')::uuid)),
  '+1 (902) 555-0100', 'Signed-out players can read a venue phone');
reset role;

select * from finish();
rollback;
