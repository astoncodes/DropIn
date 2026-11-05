-- Venue hours reported by players, how long the current game will last, and
-- venue phone and website contacts.
--
-- * private.venue_presence_distance() is the one proof that a player is at a
--   venue. create_check_in() and the new report_venue_closed() both use it.
-- * venue_closed_reports records "it's closed" from players standing at the
--   venue. Only the distance and accuracy are kept, never a coordinate.
-- * venue_reported_hours() turns eight weeks of check-ins and closed reports
--   into an aggregate answer to "when is this place open?".
-- * venue_details() gains most_here_until, phone and website.
-- * The pulse ("need players", "full, next game", ...) and the "crowded"
--   condition are removed. Nothing wrote either, and the app shows nothing
--   that would put a player off going except a true closed report.
-- * Venues and submissions gain an optional phone and website, entered by the
--   submitting player and checked by an admin.

-- ---------------------------------------------------------------------------
-- Venue contacts
-- ---------------------------------------------------------------------------

-- The one definition of a valid venue phone and website. Table constraints and
-- the RPCs below use these; packages/shared mirrors them for forms.
create function private.is_venue_phone(p_value text) returns boolean
language sql immutable set search_path = '' as $$
  select p_value ~ '^[0-9+(). -]{7,20}$'
     and char_length(pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g')) >= 7
$$;

create function private.is_venue_website(p_value text) returns boolean
language sql immutable set search_path = '' as $$
  select char_length(p_value) <= 200
     and p_value ~ '^https://[^[:space:]/]+\.[^[:space:]/]+(/[^[:space:]]*)?$'
$$;

revoke all on function private.is_venue_phone(text), private.is_venue_website(text)
  from public, anon, authenticated;

alter table public.venues
  add column phone text,
  add column website text,
  add constraint venues_phone_format check (phone is null or private.is_venue_phone(phone)),
  add constraint venues_website_format check (website is null or private.is_venue_website(website));

alter table public.venue_candidates
  add column phone text,
  add column website text,
  add constraint venue_candidates_phone_format check (phone is null or private.is_venue_phone(phone)),
  add constraint venue_candidates_website_format check (website is null or private.is_venue_website(website));

comment on column public.venues.phone is
  'Public contact number from the submitting player or an admin. Imports never overwrite it.';
comment on column public.venues.website is
  'Public https website from the submitting player or an admin. Imports never overwrite it.';

-- ---------------------------------------------------------------------------
-- Proof of presence
-- ---------------------------------------------------------------------------

-- Whether a fresh, accurate reading puts the caller within 250 m of an active
-- venue in a published region. Returns the distance in metres and raises
-- otherwise; p_purpose finishes the messages ("to check in"). The coordinate is
-- used here and never stored. Only SECURITY DEFINER RPCs call this, so it runs
-- with their rights and needs no grant of its own.
create function private.venue_presence_distance(
  p_venue_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_accuracy double precision,
  p_observed_at timestamptz,
  p_purpose text
) returns double precision
language plpgsql stable set search_path = '' as $$
declare
  v_location extensions.geography;
  v_distance double precision;
begin
  if p_lat is null or not (p_lat between -90 and 90)
     or p_lon is null or not (p_lon between -180 and 180)
     or p_accuracy is null or not (p_accuracy between 0 and 100) then
    raise exception 'A location reading accurate to 100 metres or better is required.' using errcode = '22023';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '2 minutes'
     or p_observed_at > now() + interval '30 seconds' then
    raise exception 'Your location reading is too old. Please try again.' using errcode = '22023';
  end if;
  select v.location into v_location
    from public.venues v join public.regions r on r.id = v.region_id
   where v.id = p_venue_id and v.status = 'active' and r.is_published;
  if not found then
    raise exception 'This venue is not available to %.', p_purpose using errcode = '22023';
  end if;
  v_distance := extensions.st_distance(
    v_location,
    extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography
  );
  if v_distance > 250 then
    raise exception 'Move within 250 metres of the venue to %.', p_purpose using errcode = '22023';
  end if;
  return v_distance;
end;
$$;

revoke all on function private.venue_presence_distance(uuid, double precision, double precision,
  double precision, timestamptz, text) from public, anon, authenticated;

-- Same signature, grants and behaviour; the location and venue checks now come
-- from venue_presence_distance(). SECURITY DEFINER is required because clients
-- have read-only table grants: all writes must pass the checks below.
create or replace function public.create_check_in(
  p_venue_id uuid,
  p_sport_id bigint,
  p_lat double precision,
  p_lon double precision,
  p_accuracy double precision,
  p_observed_at timestamptz,
  p_duration_minutes integer default 90,
  p_party_size integer default 1,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_distance double precision;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to check in.' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 240 then
    raise exception 'Choose a duration between 30 minutes and 4 hours.' using errcode = '22023';
  end if;
  if p_party_size is null or p_party_size not between 1 and 20 then
    raise exception 'Party size must be between 1 and 20, including you.' using errcode = '22023';
  end if;
  if char_length(btrim(p_note)) > 120 then
    raise exception 'Keep your note to 120 characters.' using errcode = '22023';
  end if;

  -- Every presence write for a player takes the same lock. Concurrent requests
  -- cannot both claim the single open-check-in or open-intent slot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  v_distance := private.venue_presence_distance(p_venue_id, p_lat, p_lon, p_accuracy, p_observed_at, 'check in');
  select v.region_id into v_region from public.venues v where v.id = p_venue_id;
  if not exists (
    select 1 from public.venue_sports vs join public.sports s on s.id = vs.sport_id
    where vs.venue_id = p_venue_id and vs.sport_id = p_sport_id and s.is_active
  ) then
    raise exception 'Choose a sport available at this venue.' using errcode = '22023';
  end if;

  update public.check_ins set ended_at = now(),
    end_reason = case when expires_at <= now() then 'expired'::public.check_in_end_reason
                      else 'replaced'::public.check_in_end_reason end
    where user_id = v_user and ended_at is null;
  insert into public.check_ins (
    user_id, venue_id, region_id, sport_id, party_size, note, expires_at,
    location_verified, distance_to_venue_m, reported_accuracy_m
  ) values (
    v_user, p_venue_id, v_region, p_sport_id, p_party_size, nullif(btrim(p_note), ''),
    now() + make_interval(mins => p_duration_minutes), true, v_distance, p_accuracy
  ) returning id into v_id;
  update public.arrival_intents set fulfilled_by_check_in_id = v_id
    where user_id = v_user and venue_id = p_venue_id and cancelled_at is null
      and fulfilled_by_check_in_id is null and expires_at > now();
  update public.arrival_intents set cancelled_at = now()
    where user_id = v_user and cancelled_at is null and fulfilled_by_check_in_id is null;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove the pulse and the "crowded" condition
-- ---------------------------------------------------------------------------

-- Their return types change, so they are recreated below rather than replaced.
drop function public.nearby_venues(double precision, double precision, double precision, bigint[], integer);
drop function public.venue_details(uuid);
drop function public.venue_activity(uuid);

-- Nothing can write a condition, so no row should be "crowded". If one exists,
-- stop: deciding what happens to it is a person's call, not this migration's.
do $$
begin
  if exists (select 1 from public.venue_conditions where kind::text = 'crowded') then
    raise exception 'venue_conditions has crowded rows; resolve them before removing the kind';
  end if;
end;
$$;

alter type public.venue_condition_kind rename to venue_condition_kind_old;
create type public.venue_condition_kind as enum (
  'lights_on',
  'lights_off',
  'wet_surface',
  'locked',
  'equipment_issue'
);
alter table public.venue_conditions
  alter column kind type public.venue_condition_kind using kind::text::public.venue_condition_kind;
drop type public.venue_condition_kind_old;

alter table public.check_ins drop column pulse;
drop type public.venue_pulse;

create function public.nearby_venues(
  p_lat       double precision,
  p_lon       double precision,
  p_radius_m  double precision default 8000,
  p_sport_ids bigint[] default null,
  p_limit     integer default 60
)
returns table (
  venue_id           uuid,
  name               text,
  latitude           double precision,
  longitude          double precision,
  distance_m         double precision,
  indoor_state       public.indoor_state,
  verification_state public.verification_state,
  sport_slugs        text[],
  sport_names        text[],
  here_now           integer,
  heading_there      integer,
  party_count        integer,
  last_activity_at   timestamptz,
  next_run_at        timestamptz,
  condition_kinds    public.venue_condition_kind[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography as g
  ),
  in_range as (
    select v.*, extensions.ST_Distance(v.location, o.g) as distance_m
      from public.venues v
      cross join origin o
     where v.status = 'active'
       and extensions.ST_DWithin(v.location, o.g, p_radius_m)
  ),
  filtered as (
    select r.*
      from in_range r
     where p_sport_ids is null
        or exists (
             select 1 from public.venue_sports vs
              where vs.venue_id = r.id and vs.sport_id = any (p_sport_ids)
           )
  )
  select f.id,
         f.name,
         extensions.ST_Y(f.location::extensions.geometry),
         extensions.ST_X(f.location::extensions.geometry),
         f.distance_m,
         f.indoor_state,
         f.verification_state,
         coalesce(sports.slugs, array[]::text[]),
         coalesce(sports.names, array[]::text[]),
         -- The headline number is a sum of party_size, not a row count:
         -- someone who brought four friends is five players present.
         coalesce(live.here_now, 0)::integer,
         coalesce(intent.heading_there, 0)::integer,
         coalesce(live.party_count, 0)::integer,
         live.last_activity_at,
         run.next_run_at,
         coalesce(cond.kinds, array[]::public.venue_condition_kind[])
    from filtered f
    left join lateral (
      select array_agg(sp.slug order by sp.sort_order) as slugs,
             array_agg(sp.name order by sp.sort_order) as names
        from public.venue_sports vs
        join public.sports sp on sp.id = vs.sport_id
       where vs.venue_id = f.id and sp.is_active
    ) sports on true
    left join lateral (
      select sum(c.party_size)::integer as here_now,
             count(*)::integer          as party_count,
             max(c.started_at)          as last_activity_at
        from public.check_ins c
       where c.venue_id = f.id
         and c.ended_at is null
         and c.expires_at > now()
    ) live on true
    left join lateral (
      select count(*)::integer as heading_there
        from public.arrival_intents ai
       where ai.venue_id = f.id
         and ai.cancelled_at is null
         and ai.fulfilled_by_check_in_id is null
         and ai.expires_at > now()
    ) intent on true
    left join lateral (
      select min(u.starts_at) as next_run_at
        from public.upcoming_runs(null, p_sport_ids, f.id, now(), 14) u
    ) run on true
    left join lateral (
      select array_agg(distinct vc.kind) as kinds
        from public.venue_conditions vc
       where vc.venue_id = f.id and vc.expires_at > now()
    ) cond on true
   order by
     -- Active venues first: "where can I play now" is the question this screen
     -- exists to answer, and the nearest empty court does not answer it.
     (coalesce(live.here_now, 0) > 0) desc,
     (coalesce(intent.heading_there, 0) > 0) desc,
     f.distance_m asc
   limit greatest(p_limit, 1)
$$;

comment on function public.nearby_venues is
  'Active venues near a point with live aggregates. SECURITY DEFINER so anonymous browsers get counts without read access to check_ins.';

grant execute on function public.nearby_venues(double precision, double precision, double precision, bigint[], integer)
  to anon, authenticated;

create function public.venue_details(p_venue_id uuid)
returns table (
  venue_id           uuid,
  canonical_id       uuid,
  was_merged         boolean,
  name               text,
  latitude           double precision,
  longitude          double precision,
  address_text       text,
  indoor_state       public.indoor_state,
  verification_state public.verification_state,
  region_slug        text,
  sport_ids          bigint[],
  sport_slugs        text[],
  sport_names        text[],
  here_now           integer,
  heading_there      integer,
  party_count        integer,
  last_activity_at   timestamptz,
  most_here_until    timestamptz,
  aliases            text[],
  phone              text,
  website            text
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Follow one merge hop so an old link resolves to the surviving venue
  -- instead of 404ing.
  --
  -- One hop is sufficient only while nothing can build a merge chain. Today
  -- nothing writes venues.merged_into_venue_id at all: admin_review_candidate()
  -- merges a *candidate* into a venue, and there is no venue-to-venue merge
  -- RPC. Whatever adds one must reject cycles and chains, or this has to
  -- become a recursive walk.
  with requested as (
    select v.id, v.merged_into_venue_id from public.venues v where v.id = p_venue_id
  ),
  target as (
    select coalesce(r.merged_into_venue_id, r.id) as id,
           r.merged_into_venue_id is not null as was_merged
      from requested r
  )
  select p_venue_id,
         v.id,
         t.was_merged,
         v.name,
         extensions.ST_Y(v.location::extensions.geometry),
         extensions.ST_X(v.location::extensions.geometry),
         v.address_text,
         v.indoor_state,
         v.verification_state,
         rg.slug,
         coalesce(sports.ids, array[]::bigint[]),
         coalesce(sports.slugs, array[]::text[]),
         coalesce(sports.names, array[]::text[]),
         coalesce(live.here_now, 0)::integer,
         coalesce(intent.heading_there, 0)::integer,
         coalesce(live.party_count, 0)::integer,
         live.last_activity_at,
         stay.most_here_until,
         coalesce(al.aliases, array[]::text[]),
         v.phone,
         v.website
    from target t
    join public.venues v on v.id = t.id and v.status = 'active'
    join public.regions rg on rg.id = v.region_id
    left join lateral (
      select array_agg(sp.id order by sp.sort_order)   as ids,
             array_agg(sp.slug order by sp.sort_order) as slugs,
             array_agg(sp.name order by sp.sort_order) as names
        from public.venue_sports vs
        join public.sports sp on sp.id = vs.sport_id
       where vs.venue_id = v.id and sp.is_active
    ) sports on true
    left join lateral (
      select sum(c.party_size)::integer as here_now,
             count(*)::integer          as party_count,
             max(c.started_at)          as last_activity_at
        from public.check_ins c
       where c.venue_id = v.id and c.ended_at is null and c.expires_at > now()
    ) live on true
    left join lateral (
      select count(*)::integer as heading_there
        from public.arrival_intents ai
       where ai.venue_id = v.id
         and ai.cancelled_at is null
         and ai.fulfilled_by_check_in_id is null
         and ai.expires_at > now()
    ) intent on true
    left join lateral (
      -- When half the players present will have left, by the stay lengths they
      -- chose at check-in. Weighted by party size: a group of four leaving is
      -- four players leaving.
      select min(s.expires_at) as most_here_until
        from (
          select c.expires_at,
                 sum(c.party_size) over (order by c.expires_at, c.id) as gone_by_then,
                 sum(c.party_size) over () as present
            from public.check_ins c
           where c.venue_id = v.id and c.ended_at is null and c.expires_at > now()
        ) s
       where s.gone_by_then * 2 >= s.present
    ) stay on true
    left join lateral (
      select array_agg(a.alias) as aliases
        from public.venue_aliases a where a.venue_id = v.id
    ) al on true
$$;

comment on function public.venue_details is
  'One public venue payload. Resolves a merged id to its canonical venue so old links keep working.';

grant execute on function public.venue_details(uuid) to anon, authenticated;

create function public.venue_activity(p_venue_id uuid)
returns table (
  kind         text,
  display_name text,
  avatar_path  text,
  sport_slug   text,
  party_size   smallint,
  note         text,
  started_at   timestamptz,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Only currently-active rows are ever returned. Expired presence is not
  -- "old news" here, it is private: publishing it would turn the venue page
  -- into a log of who was where and when.
  select 'check_in'::text,
         coalesce(pr.display_name, 'Player'),
         pr.avatar_path,
         sp.slug,
         c.party_size,
         c.note,
         c.started_at,
         c.expires_at
    from public.check_ins c
    join public.sports sp on sp.id = c.sport_id
    left join public.profiles pr on pr.id = c.user_id
   where c.venue_id = p_venue_id and c.ended_at is null and c.expires_at > now()

  union all

  select 'heading_there'::text,
         coalesce(pr.display_name, 'Player'),
         pr.avatar_path,
         sp.slug,
         1::smallint,
         null,
         ai.created_at,
         ai.expires_at
    from public.arrival_intents ai
    join public.sports sp on sp.id = ai.sport_id
    left join public.profiles pr on pr.id = ai.user_id
   where ai.venue_id = p_venue_id
     and ai.cancelled_at is null
     and ai.fulfilled_by_check_in_id is null
     and ai.expires_at > now()

   order by 1, 7 desc
$$;

grant execute on function public.venue_activity(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Closed reports and reported hours
-- ---------------------------------------------------------------------------

-- Reported hours read up to eight weeks of finished check-ins per venue. The
-- live index covers only check-ins that have not ended.
create index check_ins_venue_started_idx on public.check_ins (venue_id, started_at);

create table public.venue_closed_reports (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues (id) on delete restrict,
  user_id             uuid not null references auth.users (id) on delete cascade,
  reported_at         timestamptz not null default now(),
  -- Location evidence, not location history, exactly as on check_ins.
  distance_to_venue_m numeric(8, 1) not null,
  reported_accuracy_m numeric(8, 1) not null,

  constraint venue_closed_reports_distance check (distance_to_venue_m between 0 and 250),
  constraint venue_closed_reports_accuracy check (reported_accuracy_m between 0 and 100)
);

comment on table public.venue_closed_reports is
  'A player at the venue found it closed. Written only by report_venue_closed(); read only as aggregates through venue_reported_hours(), so no reporter is ever exposed.';

create index venue_closed_reports_venue_idx on public.venue_closed_reports (venue_id, reported_at desc);
create index venue_closed_reports_user_idx on public.venue_closed_reports (user_id, venue_id, reported_at desc);

-- No client grants and no policies: the RPCs below are the only way in or out.
alter table public.venue_closed_reports enable row level security;
revoke all on public.venue_closed_reports from anon, authenticated;

create trigger rate_limit_venue_closed_reports before insert on public.venue_closed_reports
  for each row execute function private.limit_user_writes('venue_closed_report', '3', '20');
create trigger guard_account_deletion before insert or update on public.venue_closed_reports
  for each statement execute function public.guard_account_deletion();

-- SECURITY DEFINER: players have no grants on venue_closed_reports or check_ins
-- writes. This is the only write path, and it proves presence first.
create function public.report_venue_closed(
  p_venue_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_accuracy double precision,
  p_observed_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_distance double precision;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to report a venue closed.' using errcode = '42501';
  end if;
  -- The presence lock also serialises this player's reports, so two requests
  -- cannot both pass the hourly check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('presence:' || v_user::text, 0));
  v_distance := private.venue_presence_distance(
    p_venue_id, p_lat, p_lon, p_accuracy, p_observed_at, 'report it closed'
  );
  if exists (
    select 1 from public.venue_closed_reports r
     where r.user_id = v_user and r.venue_id = p_venue_id
       and r.reported_at > now() - interval '1 hour'
  ) then
    raise exception 'You reported this venue closed in the last hour.' using errcode = '22023';
  end if;

  insert into public.venue_closed_reports (venue_id, user_id, distance_to_venue_m, reported_accuracy_m)
    values (p_venue_id, v_user, v_distance, p_accuracy)
    returning id into v_id;
  -- Finding the venue closed ends the reporter's own visit there.
  update public.check_ins set ended_at = now(),
    end_reason = case when expires_at <= now() then 'expired'::public.check_in_end_reason
                      else 'checkout'::public.check_in_end_reason end
    where user_id = v_user and venue_id = p_venue_id and ended_at is null;
  return v_id;
end;
$$;

revoke all on function public.report_venue_closed(uuid, double precision, double precision,
  double precision, timestamptz) from public, anon;
grant execute on function public.report_venue_closed(uuid, double precision, double precision,
  double precision, timestamptz) to authenticated;

-- SECURITY DEFINER: the answer is built from check-ins and closed reports that
-- callers cannot read row by row. Only aggregates leave: an hour counts only
-- when at least two different players were there, and no hours are shown until
-- five different players have visited in the last eight weeks, so no single
-- player's routine can be read from it. Hours are local to the venue's region,
-- and open_until_hour is exclusive (24 is midnight; it can be below
-- open_from_hour when the range runs past midnight).
create function public.venue_reported_hours(p_venue_id uuid)
returns table (
  open_from_hour           smallint,
  open_until_hour          smallint,
  open_player_count        integer,
  last_closed_at           timestamptz,
  last_closed_player_count integer,
  closed_now               boolean
)
language sql stable security definer set search_path = '' as $$
  with venue as (
    select v.id, r.timezone
      from public.venues v
      join public.regions r on r.id = v.region_id
     where v.id = p_venue_id and v.status = 'active'
  ),
  visits as (
    select c.user_id,
           c.started_at,
           least(coalesce(c.ended_at, c.expires_at), c.expires_at, now()) as left_at
      from public.check_ins c
      join venue on venue.id = c.venue_id
     where c.started_at >= now() - interval '8 weeks'
       and c.started_at <= now()
  ),
  visit_hours as (
    -- Every local hour a visit touched, including the hour it started in, so a
    -- check-in that ended seconds later still counts.
    select x.user_id, extract(hour from h)::integer as hour
      from visits x
      cross join venue
      cross join lateral pg_catalog.generate_series(
        pg_catalog.date_trunc('hour', x.started_at at time zone venue.timezone),
        greatest(
          (x.left_at at time zone venue.timezone) - interval '1 second',
          pg_catalog.date_trunc('hour', x.started_at at time zone venue.timezone)
        ),
        interval '1 hour'
      ) h
  ),
  open_hours as (
    select hour from visit_hours group by hour having count(distinct user_id) >= 2
  ),
  -- The range is everything except the longest quiet stretch on a 24-hour
  -- clock, so evenings that run past midnight read 9pm–1am, not 12am–12am.
  gaps as (
    select hour,
           coalesce(lead(hour) over (order by hour), min(hour) over () + 24) - hour as gap_after
      from open_hours
  ),
  open_span as (
    select ((hour + gap_after) % 24)::smallint as open_from,
           (hour + 1)::smallint as open_until
      from gaps
     order by gap_after desc, hour desc
     limit 1
  ),
  players as (
    select count(distinct user_id)::integer as total from visits
  ),
  closed as (
    select r.user_id, r.reported_at
      from public.venue_closed_reports r
      join venue on venue.id = r.venue_id
     where r.reported_at >= now() - interval '8 weeks'
  ),
  last_closed as (
    select max(reported_at) as at from closed
  ),
  last_closed_day as (
    select count(distinct c.user_id)::integer as players
      from closed c
      cross join venue
      cross join last_closed l
     where (c.reported_at at time zone venue.timezone)::date = (l.at at time zone venue.timezone)::date
  )
  select case when p.total >= 5 then s.open_from end,
         case when p.total >= 5 then s.open_until end,
         case when p.total >= 5 and s.open_from is not null then p.total end,
         l.at,
         case when l.at is not null then d.players end,
         coalesce(
           l.at > now() - interval '2 hours'
             and not exists (
               select 1 from public.check_ins c
                where c.venue_id = venue.id and c.started_at > l.at
             ),
           false
         )
    from venue
    cross join players p
    cross join last_closed l
    cross join last_closed_day d
    left join open_span s on true
$$;

revoke all on function public.venue_reported_hours(uuid) from public;
grant execute on function public.venue_reported_hours(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contacts through submission, review and admin edits
-- ---------------------------------------------------------------------------

-- Each gains contact arguments, which changes its signature.
drop function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text);
drop function public.admin_review_candidate(uuid, text, text, uuid, text);
drop function public.admin_update_venue(uuid, text, text, public.indoor_state, public.venue_status, boolean, bigint[]);

create function public.submit_venue(
  p_name         text,
  p_lat          double precision,
  p_lon          double precision,
  p_sport_ids    bigint[],
  p_indoor_state public.indoor_state,
  p_address_text text default null,
  p_phone        text default null,
  p_website      text default null
)
returns table (
  candidate_id uuid,
  status public.venue_candidate_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_candidate_id uuid;
  v_region_id    bigint;
  v_name         text := btrim(p_name);
  v_address      text := nullif(btrim(p_address_text), '');
  v_phone        text := nullif(btrim(p_phone), '');
  v_website      text := nullif(btrim(p_website), '');
  v_sport_count  integer;
  v_status       public.venue_candidate_status := 'pending';
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'Venue name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  if v_address is not null and char_length(v_address) > 240 then
    raise exception 'Address must be 240 characters or fewer' using errcode = '22023';
  end if;

  if v_phone is not null and not private.is_venue_phone(v_phone) then
    raise exception 'Phone numbers use digits, spaces and + ( ) - . and need at least 7 digits.' using errcode = '22023';
  end if;

  if v_website is not null and not private.is_venue_website(v_website) then
    raise exception 'Websites must start with https:// and be 200 characters or fewer.' using errcode = '22023';
  end if;

  if p_lat is null or p_lon is null
     or p_lat = 'NaN'::double precision or p_lon = 'NaN'::double precision
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Latitude or longitude is invalid' using errcode = '22023';
  end if;

  if p_sport_ids is null or cardinality(p_sport_ids) = 0 then
    raise exception 'Choose at least one sport' using errcode = '22023';
  end if;

  select count(distinct s.id)::integer
    into v_sport_count
    from public.sports s
   where s.id = any (p_sport_ids)
     and s.is_active;

  if v_sport_count <> (select count(distinct x) from unnest(p_sport_ids) x) then
    raise exception 'Every selected sport must exist and be active' using errcode = '22023';
  end if;

  -- A candidate belongs to the smallest published region containing its pin.
  -- This prevents a client from assigning a coordinate to an arbitrary region.
  select r.id
    into v_region_id
    from public.regions r
   where r.is_published
     and p_lat between r.min_lat and r.max_lat
     and p_lon between r.min_lon and r.max_lon
   order by (r.max_lat - r.min_lat) * (r.max_lon - r.min_lon), r.id
   limit 1;

  if v_region_id is null then
    raise exception 'This location is outside a supported region' using errcode = '22023';
  end if;

  insert into public.venue_candidates (
    region_id, submitted_by, proposed_name, address_text, location, indoor_state,
    phone, website
  ) values (
    v_region_id,
    v_user_id,
    v_name,
    v_address,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography,
    p_indoor_state,
    v_phone,
    v_website
  )
  returning id into v_candidate_id;

  insert into public.venue_candidate_sports (candidate_id, sport_id, origin)
  select v_candidate_id, s.id, 'submitted'::public.venue_candidate_sport_origin
    from public.sports s
   where s.id = any (p_sport_ids);

  insert into public.venue_candidate_matches (
    candidate_id, venue_id, distance_m, shared_sport_count, name_similarity, score
  )
  select v_candidate_id, d.venue_id, d.distance_m, d.shared_sport_count,
         d.name_similarity, d.score
    from public.find_duplicate_candidates(
      p_lat, p_lon, p_sport_ids, 100, null, v_name
    ) d;

  if exists (
    select 1 from public.venue_candidate_matches m where m.candidate_id = v_candidate_id
  ) then
    v_status := 'possible_duplicate';
    update public.venue_candidates
       set status = v_status,
           duplicate_of_venue_id = (
             select m.venue_id
               from public.venue_candidate_matches m
              where m.candidate_id = v_candidate_id
              order by m.score desc, m.distance_m
              limit 1
           )
     where id = v_candidate_id;
  end if;

  return query select v_candidate_id, v_status;
end
$$;

comment on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text, text, text) is
  'Creates a private user venue candidate at the final confirmed coordinate and caches possible duplicate matches.';

revoke all on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text, text, text)
  from public, anon;
grant execute on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text, text, text)
  to authenticated;

create function public.admin_review_candidate(
  p_candidate_id uuid, p_decision text, p_note text default null,
  p_target_venue_id uuid default null, p_name text default null,
  p_phone text default null, p_website text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.venue_candidates; v_id uuid; v_name text; v_phone text; v_website text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'merge') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if char_length(p_note) > 1000 then raise exception 'Review note is too long' using errcode = '22023'; end if;
  if p_decision = 'reject' and coalesce(btrim(p_note), '') = '' then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  select * into c from public.venue_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if c.status not in ('pending', 'possible_duplicate') then
    raise exception 'This submission has already been reviewed' using errcode = '22023';
  end if;
  -- A reviewer's contact replaces the submitted one; blank keeps the submission's.
  v_phone := coalesce(nullif(btrim(p_phone), ''), c.phone);
  v_website := coalesce(nullif(btrim(p_website), ''), c.website);
  if v_phone is not null and not private.is_venue_phone(v_phone) then
    raise exception 'Phone numbers use digits, spaces and + ( ) - . and need at least 7 digits.' using errcode = '22023';
  end if;
  if v_website is not null and not private.is_venue_website(v_website) then
    raise exception 'Websites must start with https:// and be 200 characters or fewer.' using errcode = '22023';
  end if;
  if p_decision = 'approve' then
    v_name := coalesce(nullif(btrim(p_name), ''), c.proposed_name);
    if not exists (select 1 from public.venue_candidate_sports where candidate_id = c.id) then
      raise exception 'Submission needs at least one sport' using errcode = '22023';
    end if;
    insert into public.venues(region_id, name, location, address_text, indoor_state, created_by, phone, website)
    values(c.region_id, v_name, c.location, c.address_text, c.indoor_state, auth.uid(), v_phone, v_website)
    returning id into v_id;
    insert into public.venue_sports(venue_id, sport_id)
    select v_id, sport_id from public.venue_candidate_sports where candidate_id = c.id;
  elsif p_decision = 'merge' then
    select id into v_id from public.venues where id = p_target_venue_id and status = 'active'
      and region_id = c.region_id for update;
    if v_id is null then raise exception 'Choose an active venue in the same region' using errcode = '22023'; end if;
    insert into public.venue_aliases(venue_id, alias, source) values(v_id, c.proposed_name, 'review') on conflict do nothing;
    -- Fill only contacts the venue lacks; a reviewed contact is never replaced.
    update public.venues set phone = coalesce(phone, v_phone), website = coalesce(website, v_website)
     where id = v_id;
    insert into public.venue_sports(venue_id, sport_id)
      select v_id, sport_id from public.venue_candidate_sports where candidate_id = c.id on conflict do nothing;
  end if;
  update public.venue_candidates set
    status = (case p_decision when 'approve' then 'approved' when 'merge' then 'merged' else 'rejected' end)::public.venue_candidate_status,
    published_venue_id = v_id, duplicate_of_venue_id = case when p_decision = 'merge' then v_id else duplicate_of_venue_id end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = c.id;
  insert into public.admin_audit_log(actor_id, action, entity_id, details)
    values(auth.uid(), 'candidate.' || p_decision, c.id, jsonb_build_object('venue_id', v_id, 'note', p_note));
  return v_id;
end $$;

revoke all on function public.admin_review_candidate(uuid,text,text,uuid,text,text,text) from public, anon;

grant execute on function public.admin_review_candidate(uuid,text,text,uuid,text,text,text) to authenticated;

create function public.admin_update_venue(
  p_venue_id uuid, p_name text, p_address text, p_indoor_state public.indoor_state,
  p_status public.venue_status, p_verified boolean, p_sport_ids bigint[],
  p_phone text, p_website text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.venues;
  v_phone text := nullif(btrim(p_phone), '');
  v_website text := nullif(btrim(p_website), '');
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v from public.venues where id = p_venue_id for update;
  if not found then raise exception 'Venue not found' using errcode = 'P0002'; end if;
  if v.status = 'merged' or p_status is null or p_status not in ('active','removed') then
    raise exception 'Merged venues cannot be edited' using errcode = '22023'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 120 or char_length(p_address) > 240 then
    raise exception 'Check venue name and address length' using errcode = '22023'; end if;
  if p_sport_ids is null or cardinality(p_sport_ids) = 0 or exists (
    select 1 from unnest(p_sport_ids) x where x is null or not exists(select 1 from public.sports s where s.id = x)
  ) then raise exception 'Choose valid sports' using errcode = '22023'; end if;
  if v_phone is not null and not private.is_venue_phone(v_phone) then
    raise exception 'Phone numbers use digits, spaces and + ( ) - . and need at least 7 digits.' using errcode = '22023';
  end if;
  if v_website is not null and not private.is_venue_website(v_website) then
    raise exception 'Websites must start with https:// and be 200 characters or fewer.' using errcode = '22023';
  end if;
  update public.venues set name = btrim(p_name), address_text = nullif(btrim(p_address), ''),
    phone = v_phone, website = v_website,
    indoor_state = p_indoor_state, status = p_status,
    verification_state = case when p_verified then 'admin_verified'::public.verification_state else 'unverified'::public.verification_state end,
    verified_at = case when p_verified then coalesce(v.verified_at, now()) else null end,
    verified_by = case when p_verified then auth.uid() else null end,
    verification_method = case when p_verified then 'Admin review' else null end where id = v.id;
  delete from public.venue_sports where venue_id = v.id and not (sport_id = any(p_sport_ids));
  insert into public.venue_sports(venue_id, sport_id) select v.id, unnest(p_sport_ids) on conflict do nothing;
  insert into public.admin_audit_log(actor_id, action, entity_id, details)
    values(auth.uid(), 'venue.update', v.id, jsonb_build_object('before', to_jsonb(v), 'name', p_name, 'status', p_status));
end $$;

revoke all on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[],text,text) from public, anon;

grant execute on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[],text,text) to authenticated;
