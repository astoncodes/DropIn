-- Row level security on the lookup tables, from every caller perspective:
-- anonymous, authenticated non-admin, and admin.
--
-- The unpublished smoke-test region is the interesting case. It must be
-- invisible to real users while remaining fully usable by the importer, which
-- connects as a privileged database role and bypasses RLS entirely.

begin;
select plan(13);

-- Fixtures. Created as postgres, which has BYPASSRLS — this is also the
-- documented bootstrap path for the first admin (docs/architecture.md).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'player@example.test'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'admin@example.test');

insert into public.admin_users (user_id, note)
values ('33333333-3333-3333-3333-333333333333', 'fixture admin');

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select count(*)::int from public.regions),
  1,
  'anon sees only published regions'
);

select is_empty(
  $$ select 1 from public.regions where slug = 'halifax' $$,
  'anon cannot see the unpublished smoke-test region'
);

select is(
  (select count(*)::int from public.sports),
  6,
  'anon sees only active sports'
);

select is_empty(
  $$ select 1 from public.sports where slug = 'ice-hockey' $$,
  'anon cannot see an inactive sport'
);

select throws_ok(
  $$ select 1 from public.osm_sport_aliases $$,
  '42501',
  null,
  'anon is denied the alias map outright — import machinery is not player-facing'
);

-- ---------------------------------------------------------------------------
-- Authenticated, not an admin
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.regions),
  1,
  'a signed-in non-admin still sees only published regions'
);

select throws_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('sneaky', 'Sneaky', 46.0, -63.0, 47.0, -62.0, 'America/Halifax') $$,
  '42501',
  null,
  'a non-admin cannot create a region'
);

-- A non-admin's UPDATE is filtered by the policy's USING clause rather than
-- rejected, so it succeeds while touching nothing. The assertion has to check
-- the resulting state, which means dropping back to a role that can see it.
update public.sports set is_active = true where slug = 'ice-hockey';

reset role;

select is(
  (select is_active from public.sports where slug = 'ice-hockey'),
  false,
  'a non-admin updating a sport silently affects no rows'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.regions),
  2,
  'an admin sees the unpublished region too'
);

select is(
  (select count(*)::int from public.sports),
  7,
  'an admin sees inactive sports'
);

select isnt_empty(
  $$ select 1 from public.osm_sport_aliases where alias = 'five-a-side' $$,
  'an admin can read the alias map'
);

select lives_ok(
  $$ insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone)
     values ('summerside', 'Summerside, PE', 46.36, -63.83, 46.42, -63.75, 'America/Halifax') $$,
  'an admin can create a region'
);

select is(
  (select is_published from public.regions where slug = 'summerside'),
  false,
  'a newly created region defaults to unpublished'
);

reset role;
select * from finish();
rollback;
