-- Admin identity: the escalation boundary.
--
-- The rule being defended is that no path through the API turns a player into
-- an admin. If any of these fail, every other admin-gated policy in the schema
-- is decorative.

begin;
select plan(13);

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

select is(public.is_admin(), false, 'anonymous admin check is false');
select is(public.is_admin('33333333-3333-3333-3333-333333333333'), false,
  'anonymous callers cannot discover a known admin');

select throws_ok(
  $$ select 1 from public.admin_users $$,
  '42501',
  null,
  'anon cannot read the admin roster at all'
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
  (select public.is_admin()),
  false,
  'is_admin() is false for an ordinary player'
);

select is(public.is_admin('33333333-3333-3333-3333-333333333333'), false,
  'players cannot discover another user admin status');

-- Note the difference from anon: this role *has* the SELECT grant, so the
-- query succeeds and returns nothing. The policy, not the grant, is what hides
-- the roster here.
select is_empty(
  $$ select 1 from public.admin_users $$,
  'a non-admin sees an empty roster rather than an error'
);

select throws_ok(
  $$ insert into public.admin_users (user_id)
     values ('11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a player cannot promote themselves to admin'
);

select throws_ok(
  $$ insert into public.admin_users (user_id)
     values ('22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'a player cannot promote anybody else either'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select public.is_admin()),
  false,
  'an admin without MFA is not authorized'
);
select is_empty($$ select 1 from public.admin_users $$,
  'an AAL1 admin cannot read the admin roster');
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is(
  (select public.is_admin()),
  true,
  'is_admin() is true for an admin'
);

select is(public.is_admin('33333333-3333-3333-3333-333333333333'), true,
  'an admin can explicitly check their own ID');

-- Even admins cannot grant admin through the API. There is no INSERT policy on
-- this table for anyone; promotion is a deliberate out-of-band act performed
-- with a privileged connection, which is what keeps it auditable.
select throws_ok(
  $$ insert into public.admin_users (user_id)
     values ('11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'not even an admin can grant admin through the API'
);

reset role;
select * from finish();
rollback;
