-- upcoming_runs() bounds how far ahead one call can look, whatever the caller
-- asks for. Each day in the window is materialised for every active series, and
-- the function is open to anonymous callers.
--
-- Dates are fixed so the window's edge is exact and independent of the day the
-- suite runs. 2031-01-06 is a Monday; both series start at 06:00 UTC, one on
-- Mondays and one on Tuesdays, and both outlast the window.

begin;
select plan(3);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '96666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'window-organizer@example.test');

-- Inserted directly: create_run() only accepts a start within 12 weeks of today.
insert into public.run_series (
  id, organizer_id, sport_id, location_name, latitude, longitude,
  weekday, local_start_time, local_end_time, timezone, starts_on, valid_until, title
)
select w.id::uuid, '96666666-6666-4666-8666-666666666666', s.id, 'Window test spot', 46.24, -63.13,
       w.weekday, '06:00', '08:00', 'UTC', w.starts_on::date, w.starts_on::date + 84, w.title
  from (values
    ('96666666-6666-4666-8666-000000000001', 1, '2031-02-03', 'Monday window test'),
    ('96666666-6666-4666-8666-000000000002', 2, '2031-02-04', 'Tuesday window test')
  ) as w(id, weekday, starts_on, title)
  cross join (select id from public.sports where is_active order by id limit 1) s;

set local role anon;

select results_eq(
  $$ select starts_at from public.upcoming_runs(null, null, null, '2031-01-06 06:00+00', 365)
      where run_series_id::text like '96666666-6666-4666-8666-%' and starts_at >= '2031-03-24'
      order by starts_at $$,
  $$ values ('2031-03-24 06:00+00'::timestamptz), ('2031-03-25 06:00+00'), ('2031-03-31 06:00+00') $$,
  'a year-long request ends 84 days out: the occurrence at +84 days is returned, +85 is not'
);

select is(
  (select count(*)::integer from public.upcoming_runs(null, null, null, '2031-01-06 06:00+00', 30)
    where run_series_id::text like '96666666-6666-4666-8666-%'),
  2,
  'a request inside the cap keeps its own window'
);

select is(
  (select count(*)::integer from public.upcoming_runs(null, null, null, '2031-02-03 00:00+00', 0)
    where run_series_id::text like '96666666-6666-4666-8666-%'),
  1,
  'a request for zero days still covers one day'
);

reset role;
select * from finish();
rollback;
