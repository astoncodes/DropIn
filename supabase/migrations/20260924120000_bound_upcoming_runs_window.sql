-- Bound how far ahead upcoming_runs() can look.
--
-- p_days is clamped to between one day and 12 weeks, the longest a series may
-- run (run_series_max_12_weeks). That is the widest window any caller needs: a
-- player's own schedule looks ahead as far as a series can run, and public
-- discovery asks for less. Unclamped, one anonymous call could make the function
-- materialise every active series across an arbitrary range.
--
-- The rest of the definition, including SECURITY DEFINER and search_path, is
-- the baseline's. CREATE OR REPLACE keeps the existing grants and comment.

create or replace function public.upcoming_runs(
  p_region_id bigint default null,
  p_sport_ids bigint[] default null,
  p_venue_id  uuid default null,
  p_from      timestamptz default now(),
  p_days      integer default 14
)
returns table (
  run_series_id    uuid,
  venue_id         uuid,
  venue_name       text,
  sport_id         bigint,
  sport_slug       text,
  sport_name       text,
  organizer_id     uuid,
  organizer_name   text,
  title            text,
  description      text,
  expected_players smallint,
  indoor_state     public.indoor_state,
  starts_at        timestamptz,
  ends_at          timestamptz,
  occurrence_date  date,
  is_rescheduled   boolean,
  valid_until      date,
  latitude         double precision,
  longitude        double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with window_bounds as (
    select p_from as from_ts,
           p_from + least(make_interval(days => greatest(p_days, 1)),
                          interval '12 weeks') as to_ts
  ),
  candidate_days as (
    select s.id as series_id,
           d::date as occurrence_date
      from public.run_series s
      cross join window_bounds w
      cross join lateral generate_series(
             (w.from_ts at time zone s.timezone)::date - 1,
             (w.to_ts   at time zone s.timezone)::date + 1,
             interval '1 day'
           ) as d
     where s.status = 'active'
       and (p_region_id is null or s.region_id = p_region_id)
       and (p_venue_id is null or s.venue_id = p_venue_id)
       and (p_sport_ids is null or s.sport_id = any (p_sport_ids))
       and d::date between s.starts_on and s.valid_until
       and extract(dow from d)::smallint = s.weekday
    union
    select s.id, rs.occurrence_date
      from public.run_sessions rs
      join public.run_series s on s.id = rs.run_series_id
      cross join window_bounds w
     where s.status = 'active' and rs.cancelled_at is null
       and rs.ends_at >= w.from_ts and rs.starts_at <= w.to_ts
       and (p_region_id is null or rs.region_id = p_region_id)
       and (p_venue_id is null or rs.venue_id = p_venue_id)
       and (p_sport_ids is null or rs.sport_id = any(p_sport_ids))
  ),
  resolved as (
    select s.id,
           s.venue_id,
           coalesce(rs.location_name, s.location_name) as location_name,
           coalesce(rs.latitude, s.latitude) as latitude, coalesce(rs.longitude, s.longitude) as longitude,
           s.sport_id, case when rs.id is null then s.region_id else rs.region_id end as region_id,
           s.organizer_id,
           coalesce(rs.title, s.title) as title,
           s.description,
           s.expected_players,
           s.valid_until,
           c.occurrence_date,
           e.status as exception_status, rs.cancelled_at,
           coalesce(
             rs.starts_at, e.replacement_start_at,
             (c.occurrence_date + s.local_start_time) at time zone s.timezone
           ) as starts_at,
           coalesce(
             rs.ends_at, e.replacement_end_at,
             (c.occurrence_date + s.local_end_time) at time zone s.timezone
           ) as ends_at
      from candidate_days c
      join public.run_series s on s.id = c.series_id
      left join public.run_sessions rs on rs.run_series_id = s.id and rs.occurrence_date = c.occurrence_date
      left join public.run_exceptions e
             on e.run_series_id = s.id and e.occurrence_date = c.occurrence_date
  )
  select r.id,
         r.venue_id,
         coalesce(v.name, r.location_name),
         r.sport_id,
         sp.slug,
         sp.name,
         r.organizer_id,
         pr.display_name,
         r.title,
         r.description,
         r.expected_players,
         coalesce(v.indoor_state, 'unknown'::public.indoor_state),
         r.starts_at,
         r.ends_at,
         r.occurrence_date,
         r.exception_status = 'rescheduled',
         r.valid_until,
         coalesce(extensions.ST_Y(v.location::extensions.geometry), r.latitude),
         coalesce(extensions.ST_X(v.location::extensions.geometry), r.longitude)
    from resolved r
    left join public.venues v on v.id = r.venue_id and v.status = 'active'
    join public.sports sp on sp.id = r.sport_id
    left join public.profiles pr on pr.id = r.organizer_id
    cross join window_bounds w
   where (r.venue_id is null or v.id is not null)
     and (p_region_id is null or r.region_id = p_region_id)
     and r.cancelled_at is null
     and r.exception_status is distinct from 'cancelled'
     -- A session already under way is still worth showing, so compare against
     -- the end time rather than the start.
     and r.ends_at >= w.from_ts
     and r.starts_at <= w.to_ts
   order by r.starts_at asc
$$;
