begin;
select plan(7);

select is(
  (select timezone from public.regions where slug = 'us-pacific' and is_published),
  'America/Los_Angeles',
  'Pacific United States coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'us-mountain' and is_published),
  'America/Denver',
  'Mountain United States coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'us-central' and is_published),
  'America/Chicago',
  'Central United States coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'us-eastern' and is_published),
  'America/New_York',
  'Eastern United States coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'us-alaska' and is_published),
  'America/Anchorage',
  'Alaska coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'us-hawaii' and is_published),
  'Pacific/Honolulu',
  'Hawaii coverage is published with its launch timezone'
);

select is(
  (select timezone from public.regions where slug = 'nigeria' and is_published),
  'Africa/Lagos',
  'Nigeria coverage is published with its launch timezone'
);

select * from finish();
rollback;
