-- Venue submissions launched with one small Charlottetown review region.
-- Cover Canada with timezone-aware fallback regions so a submitted venue can
-- later schedule recurring sessions in a reasonable local timezone. Existing
-- city regions remain more specific and win submit_venue's smallest-box rule.
--
-- The regions table intentionally stores bounding boxes rather than political
-- polygons. These bands therefore describe Canadian product coverage; they do
-- not claim to be authoritative provincial or international boundaries.

insert into public.regions (
  slug, name, min_lat, min_lon, max_lat, max_lon, timezone, is_published
) values
  ('canada-pacific',      'Canada — Pacific',      41.600000, -141.000000, 83.200000, -120.000000, 'America/Vancouver', true),
  ('canada-mountain',     'Canada — Mountain',     41.600000, -120.000000, 83.200000, -110.000000, 'America/Edmonton',  true),
  ('canada-central',      'Canada — Central',      41.600000, -110.000000, 83.200000,  -95.000000, 'America/Winnipeg',  true),
  ('canada-eastern',      'Canada — Eastern',      41.600000,  -95.000000, 83.200000,  -67.500000, 'America/Toronto',   true),
  ('canada-atlantic',     'Canada — Atlantic',     41.600000,  -67.500000, 83.200000,  -57.000000, 'America/Halifax',   true),
  ('canada-newfoundland', 'Canada — Newfoundland', 46.500000,  -59.500000, 61.000000,  -52.500000, 'America/St_Johns',  true)
on conflict (slug) do update set
  name = excluded.name,
  min_lat = excluded.min_lat,
  min_lon = excluded.min_lon,
  max_lat = excluded.max_lat,
  max_lon = excluded.max_lon,
  timezone = excluded.timezone,
  is_published = excluded.is_published;

