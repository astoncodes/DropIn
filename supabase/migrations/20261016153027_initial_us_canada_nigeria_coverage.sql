-- Add fallback coverage for the other two initial launch countries. Canada was
-- added in 20261013010000_canada_venue_coverage.sql. These are deliberately
-- broad timezone bands: specific city/metro regions remain smaller and win the
-- existing smallest-containing-box selection rule.
--
-- Bounding boxes are product coverage approximations, not political borders.

insert into public.regions (
  slug, name, min_lat, min_lon, max_lat, max_lon, timezone, is_published
) values
  -- Contiguous United States. Arizona and other boundary exceptions should get
  -- specific regions as venue coverage is curated in those markets.
  ('us-pacific',    'United States — Pacific',    24.300000, -125.000000, 49.500000, -114.000000, 'America/Los_Angeles', true),
  ('us-mountain',   'United States — Mountain',   24.300000, -114.000000, 49.500000, -102.000000, 'America/Denver',      true),
  ('us-central',    'United States — Central',    24.300000, -102.000000, 49.500000,  -87.500000, 'America/Chicago',     true),
  ('us-eastern',    'United States — Eastern',    24.300000,  -87.500000, 49.500000,  -66.800000, 'America/New_York',    true),
  ('us-alaska',     'United States — Alaska',     51.000000, -179.900000, 72.000000, -129.900000, 'America/Anchorage',   true),
  ('us-hawaii',     'United States — Hawaii',     18.800000, -160.400000, 22.300000, -154.700000, 'Pacific/Honolulu',    true),
  ('nigeria',       'Nigeria',                     4.200000,   2.600000,  13.900000,  14.700000, 'Africa/Lagos',        true)
on conflict (slug) do update set
  name = excluded.name,
  min_lat = excluded.min_lat,
  min_lon = excluded.min_lon,
  max_lat = excluded.max_lat,
  max_lon = excluded.max_lon,
  timezone = excluded.timezone,
  is_published = excluded.is_published;
