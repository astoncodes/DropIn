-- Venues an owner has personally verified, plus the sport they need.
--
-- Like 20260909000000_charlottetown_venues.sql, this file *is* the review
-- decision: named by a human who knows the city, recorded where it can be read
-- and reverted. Coordinates come from OpenStreetMap features inside the seeded
-- Charlottetown bounding box and are rounded to five decimals (~1 m).
--
-- Fixed UUIDs, so re-running changes nothing. All three new venues are left
-- `unverified`: publication and verification are separate claims, and the
-- admin console is where a verification decision gets recorded with a method.

-- ---------------------------------------------------------------------------
-- Badminton
-- ---------------------------------------------------------------------------
-- Chi-Wan Young runs badminton on its main floor, so the taxonomy needs the
-- sport. `osm_sport_aliases` still carries badminton as an ignored token, which
-- is a separate question: that flag governs what an automated import may
-- propose, not what the app supports.

insert into public.sports (slug, name, is_active, sort_order) values
  ('badminton', 'Badminton', true, 70)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Chi-Wan Young Sports Centre: the building, not the campus address
-- ---------------------------------------------------------------------------
-- 550 University Avenue is the UPEI campus postal address and geocodes to the
-- campus centroid, roughly 154 m from the sports centre itself. Check-in
-- validation is distance-based, so a player standing inside the building must
-- be within the accepted radius of this point.

update public.venues
set location = extensions.ST_SetSRID(extensions.ST_MakePoint(-63.14036, 46.25811), 4326)::extensions.geography,
    updated_at = now()
where id = 'b1000000-0000-4000-8000-000000000001'::uuid;

-- Futsal is played here. `osm_sport_aliases` already resolves futsal to soccer
-- because there is no dedicated futsal sport, so the link is recorded as soccer
-- rather than inventing a taxonomy entry for it.
insert into public.venue_sports (venue_id, sport_id)
select 'b1000000-0000-4000-8000-000000000001'::uuid, s.id
from public.sports s
where s.slug in ('soccer', 'badminton')
on conflict (venue_id, sport_id) do nothing;

-- ---------------------------------------------------------------------------
-- New venues
-- ---------------------------------------------------------------------------

insert into public.venues (id, region_id, name, location, address_text, indoor_state)
select
  v.id,
  -- Scalar subquery on purpose: a missing region yields NULL and fails the
  -- NOT NULL constraint. A join would insert nothing and report success.
  (select id from public.regions where slug = 'charlottetown'),
  v.name,
  extensions.ST_SetSRID(extensions.ST_MakePoint(v.lon, v.lat), 4326)::extensions.geography,
  v.address_text,
  v.indoor_state::public.indoor_state
from (values
  (
    'b1000000-0000-4000-8000-000000000005'::uuid,
    'The Alley',
    -63.12467, 46.23503,
    '200 Richmond Street, Charlottetown, PE',
    'indoor'
  ),
  (
    'b1000000-0000-4000-8000-000000000006'::uuid,
    'UPEI Turf Field',
    -63.14026, 46.26113,
    '550 University Avenue, Charlottetown, PE C1A 4P3',
    'outdoor'
  ),
  (
    -- Holland College has several campuses and only this one has the gym, so
    -- the campus is part of the name. "Holland College" is recorded as an alias
    -- below, because that is what a player will actually type.
    'b1000000-0000-4000-8000-000000000007'::uuid,
    'Holland College Grafton Street Campus',
    -63.11995, 46.23961,
    -- No street number: OpenStreetMap carries none for this building and
    -- inventing one would put a wrong address in front of a player.
    'Grafton Street, Charlottetown, PE',
    'indoor'
  )
) as v(id, name, lon, lat, address_text, indoor_state)
on conflict (id) do nothing;

insert into public.venue_aliases (venue_id, alias)
values ('b1000000-0000-4000-8000-000000000007'::uuid, 'Holland College')
on conflict (venue_id, alias) do nothing;

insert into public.venue_sports (venue_id, sport_id)
select v.venue_id, s.id
from (values
  ('b1000000-0000-4000-8000-000000000005'::uuid, 'basketball'),
  ('b1000000-0000-4000-8000-000000000006'::uuid, 'soccer'),
  ('b1000000-0000-4000-8000-000000000007'::uuid, 'basketball')
) as v(venue_id, sport_slug)
join public.sports s on s.slug = v.sport_slug
on conflict (venue_id, sport_id) do nothing;
