-- Baseline consolidated on 2026-09-08 from the 20 applied migrations.
-- Original SQL is preserved in execution order, including reference data and storage policies.
-- Existing linked databases record this baseline as applied; do not replay it there.
-- Fresh databases apply this file normally, then supabase/seed.sql for development fixtures.
--
-- READING THIS FILE
--
-- Because execution order is preserved verbatim, several functions are defined
-- more than once and only the LAST definition is live. Searching for a name and
-- reading the first hit will show you superseded code.
--
--   public.upcoming_runs      defined 3x  — later versions add pin-located sessions
--   public.join_run_session   defined 3x
--   public.handle_new_user    defined 2x
--
-- Every repeat is a `create or replace` with an identical signature and return
-- type, so applying this file to a fresh database converges on the last one.
-- Collapsing them to a single definition is worthwhile but must not be done
-- until `npm run db:test` has a project to run against — see TODO.md.
--
-- `grep -n 'function public.<name>' <this file> | tail -1` finds the live one.

-- Source: 20260817120000_extensions.sql
-- Extensions and shared helper routines.
--
-- PostGIS is enabled here rather than through the dashboard so that a fresh
-- `supabase db reset` reproduces the database exactly from committed files.
-- It lives in the `extensions` schema (Supabase convention), which means every
-- spatial type and function is referenced schema-qualified as `extensions.*`.
-- That matters because our SECURITY DEFINER functions run with an empty
-- search_path, where nothing resolves implicitly.

create schema if not exists extensions;

create extension if not exists postgis with schema extensions;

-- pgTAP powers `npm run db:test`. It is enabled by migration so that CI and a
-- fresh clone both get it without manual setup. It only adds assertion
-- functions used by supabase/tests/ — it grants no data access and is safe to
-- leave enabled, but it is separable if you would rather not ship it.
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Applied by trigger to every mutable table. Written as a trigger function
-- rather than a column default because defaults do not fire on UPDATE.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at. Attach to every mutable table.';

-- ---------------------------------------------------------------------------
-- IANA timezone validation
-- ---------------------------------------------------------------------------
-- A CHECK constraint cannot query pg_timezone_names (not immutable), but an
-- invalid timezone silently breaks daylight-saving correctness for recurring
-- runs, which is a real product rule (docs/product-rules.md §Recurring runs).
-- A trigger is the correct enforcement point.

create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text := row_to_json(new) ->> 'timezone';
begin
  if v_timezone is null then
    return new;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_timezone
  ) then
    raise exception 'invalid IANA timezone: %', v_timezone
      using errcode = 'check_violation',
            hint = 'Expected a name from pg_timezone_names, e.g. America/Halifax.';
  end if;

  return new;
end;
$$;

comment on function public.assert_valid_timezone is
  'BEFORE INSERT/UPDATE trigger: rejects a timezone column that is not a known IANA name.';

-- Source: 20260817120100_admin.sql
-- Admin identity.
--
-- Admin status is a row in a table that clients cannot write to, never a claim
-- in a JWT and never a column on profiles. A user who can edit their own
-- profile must not be one UPDATE away from becoming an admin.

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Grants admin capability. Bootstrapped out-of-band (see docs/architecture.md); no client path writes here.';

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is load-bearing, not incidental. admin_users denies SELECT
-- to anon and authenticated, so a policy calling this as the invoker would see
-- zero rows and every admin check would silently return false. Running as the
-- owner lets the check read the table while the table itself stays unreadable.
--
-- STABLE (not VOLATILE) so the planner can cache it within a statement rather
-- than re-running it per row.

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = p_user_id
  );
$$;

comment on function public.is_admin is
  'True when the given user (default: caller) is an admin. SECURITY DEFINER so RLS policies can consult admin_users, which is otherwise unreadable.';

-- Locked down explicitly. Supabase grants default privileges on new public
-- tables to anon/authenticated, so silence here would mean an open table.
revoke all on public.admin_users from anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

-- Admins may read the roster (to see who else has access). Nobody writes
-- through the API at all — not even admins. Granting a new admin is a
-- deliberate out-of-band act, which is what makes escalation auditable.
create policy admin_users_select_admin
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin());

grant select on public.admin_users to authenticated;

-- anon is never an admin, but policies on other tables call is_admin() while
-- anon is the active role. Without EXECUTE that call errors instead of
-- returning false, which would break anonymous reads of published data.
grant execute on function public.is_admin(uuid) to anon, authenticated;

-- Source: 20260817120200_lookups.sql
-- Lookup tables: regions, sports, and the OSM sport-token alias map.
--
-- These use bigint identity keys rather than UUIDs. They are small, stable,
-- and read constantly during development — a reviewer scanning a candidate row
-- can hold `sport_id = 3` in their head in a way they cannot hold a UUID.
-- Public-facing entities (venues, check-ins) use UUIDs.

-- ---------------------------------------------------------------------------
-- regions
-- ---------------------------------------------------------------------------
-- Adding a city is an INSERT here, not a code change. The bounding box is four
-- plain numbers because that is exactly the shape Overpass wants
-- (south,west,north,east) and because a human can eyeball them on a map.

create table public.regions (
  id           bigint generated always as identity primary key,
  slug         text        not null unique,
  name         text        not null,
  min_lat      numeric(9, 6) not null,
  min_lon      numeric(9, 6) not null,
  max_lat      numeric(9, 6) not null,
  max_lon      numeric(9, 6) not null,
  timezone     text        not null,
  is_published boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint regions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint regions_lat_range check (
    min_lat between -90 and 90 and max_lat between -90 and 90
  ),
  constraint regions_lon_range check (
    min_lon between -180 and 180 and max_lon between -180 and 180
  ),
  -- Ordering is checked separately from range so a transposed box produces a
  -- distinguishable error rather than looking like bad coordinates.
  constraint regions_lat_order check (min_lat < max_lat),
  constraint regions_lon_order check (min_lon < max_lon)
);

comment on table public.regions is
  'A launch market. is_published=false means imported but not publicly visible — used for the importer smoke-test region.';
comment on column public.regions.timezone is
  'IANA name. Stored per-region so recurring runs stay DST-correct; validated by trigger against pg_timezone_names.';

create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

create trigger regions_assert_valid_timezone
  before insert or update of timezone on public.regions
  for each row execute function public.assert_valid_timezone();

-- ---------------------------------------------------------------------------
-- sports
-- ---------------------------------------------------------------------------
-- Deliberately curated. OSM carries hundreds of sport tokens; this table holds
-- only the ones we present to players. Widening it is a product decision.

create table public.sports (
  id         bigint generated always as identity primary key,
  slug       text        not null unique,
  name       text        not null,
  is_active  boolean     not null default true,
  sort_order smallint    not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sports_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.sports is
  'Player-facing sports. Not a mirror of OSM tokens — see osm_sport_aliases for the mapping.';

create trigger sports_set_updated_at
  before update on public.sports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- osm_sport_aliases
-- ---------------------------------------------------------------------------
-- Maps a single normalized OSM sport token to one of our sports, or records
-- that we deliberately ignore it. Three states must stay distinguishable:
--
--   row with sport_id      -> mapped        ('five-a-side' -> soccer)
--   row with is_ignored    -> known, skipped ('horse_racing')
--   NO ROW AT ALL          -> UNKNOWN, must surface to a human reviewer
--
-- The third state is the point of the table. Without it a new OSM tag vanishes
-- silently and nobody ever learns the data changed.

create table public.osm_sport_aliases (
  alias      text primary key,
  sport_id   bigint references public.sports (id) on delete restrict,
  is_ignored boolean     not null default false,
  note       text,
  created_at timestamptz not null default now(),

  constraint osm_sport_aliases_exactly_one_resolution check (
    (sport_id is not null and is_ignored = false)
    or (sport_id is null and is_ignored = true)
  ),
  -- Enforces the importer's normalization at the storage layer. An alias is a
  -- SINGLE token, already lowercased and trimmed.
  --
  -- Real OSM data contains 'tennis; basketball' — note the space after the
  -- semicolon. The importer splits on ';' and trims, yielding 'basketball'. If
  -- either step is ever skipped, ' basketball' or the whole joined value lands
  -- here, the lookup misses, and the sport is silently lost. Each clause below
  -- catches one of those failures:
  --   lower/btrim  -> ' basketball', 'Basketball'
  --   no separator -> 'tennis; basketball' stored whole
  constraint osm_sport_aliases_normalized check (
    alias = lower(btrim(alias))
    and alias <> ''
    and alias !~ '[;[:space:]]'
  )
);

comment on table public.osm_sport_aliases is
  'OSM sport token -> our sport, or an explicit ignore. An ABSENT alias means unknown and must be surfaced during review, never dropped.';

create index osm_sport_aliases_sport_id_idx
  on public.osm_sport_aliases (sport_id)
  where sport_id is not null;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
-- Two independent controls, both required (docs/architecture.md §Access
-- control): GRANTs decide which operations a role may attempt, RLS decides
-- which rows it may touch. Supabase grants default privileges on new public
-- tables to anon/authenticated, so every table must explicitly revoke first.

revoke all on public.regions           from anon, authenticated;
revoke all on public.sports            from anon, authenticated;
revoke all on public.osm_sport_aliases from anon, authenticated;

alter table public.regions           enable row level security;
alter table public.sports            enable row level security;
alter table public.osm_sport_aliases enable row level security;

-- regions: published ones are public; admins see everything including the
-- unpublished smoke-test region.
create policy regions_select_published
  on public.regions for select to anon, authenticated
  using (is_published or public.is_admin());

create policy regions_write_admin
  on public.regions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.regions to anon, authenticated;
grant insert, update, delete on public.regions to authenticated;

-- sports: active ones are public; admins see retired sports too.
create policy sports_select_active
  on public.sports for select to anon, authenticated
  using (is_active or public.is_admin());

create policy sports_write_admin
  on public.sports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.sports to anon, authenticated;
grant insert, update, delete on public.sports to authenticated;

-- osm_sport_aliases: import machinery, not player-facing. Admins only.
-- The importer connects as a privileged database role and bypasses RLS.
create policy osm_sport_aliases_all_admin
  on public.osm_sport_aliases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.osm_sport_aliases to authenticated;

-- Source: 20260817120300_profiles.sql
-- Player identity and sport preferences.

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text        not null,
  avatar_path             text,
  home_region_id          bigint      references public.regions (id) on delete set null,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 2 and 40
  )
);

comment on table public.profiles is
  'One row per auth user, created automatically on signup. Only display_name and avatar_path are readable by other users — enforced by column-level GRANT, not by policy.';
comment on column public.profiles.avatar_path is
  'Storage object path, not a URL. Signing/serving is the client''s job so the bucket can move.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.profile_sports (
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  sport_id   bigint      not null references public.sports (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, sport_id)
);

comment on table public.profile_sports is
  'Which sports a player follows. Drives their default map filters.';

create index profile_sports_sport_id_idx on public.profile_sports (sport_id);

-- ---------------------------------------------------------------------------
-- Profile creation on signup
-- ---------------------------------------------------------------------------
-- A profile row must exist before the app can render anything for a new user,
-- and the client cannot be trusted to create it (a user who skips the call
-- would have an account with no profile). A trigger on auth.users makes it
-- unconditional and transactional with the signup itself.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Prefer a name supplied at signup; otherwise derive a placeholder from the
    -- email local part. Never leaves display_name null — it is NOT NULL, and a
    -- failure here would roll back the signup.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'player'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user is
  'AFTER INSERT on auth.users: creates the matching profile row so no account can exist without one.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- current_profile()
-- ---------------------------------------------------------------------------
-- Column-level grants (below) expose only display_name and avatar_path to
-- authenticated users, which correctly hides other people's home region and
-- onboarding state — but grants are role-wide, so they hide the caller's own
-- private fields too. This RPC is how a user reads their complete row.

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

comment on function public.current_profile is
  'The caller''s own complete profile row, including fields hidden from other users by column grants.';

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.profiles       from anon, authenticated;
revoke all on public.profile_sports from anon, authenticated;

alter table public.profiles       enable row level security;
alter table public.profile_sports enable row level security;

-- Every profile row is selectable, but the GRANT below narrows *which columns*
-- anon and authenticated may actually read. Row visibility and column
-- visibility are separate mechanisms; this table needs both.
create policy profiles_select_public
  on public.profiles for select to anon, authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: profiles are created only by the signup trigger.
-- No DELETE policy: deleting an auth user cascades here.

grant select (id, display_name, avatar_path) on public.profiles to anon, authenticated;
grant update (display_name, avatar_path, home_region_id, onboarding_completed_at)
  on public.profiles to authenticated;

grant execute on function public.current_profile() to authenticated;

-- Sport preferences are private to their owner.
create policy profile_sports_select_own
  on public.profile_sports for select to authenticated
  using (profile_id = (select auth.uid()));

create policy profile_sports_insert_own
  on public.profile_sports for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy profile_sports_delete_own
  on public.profile_sports for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, delete on public.profile_sports to authenticated;

-- Source: 20260818100000_venues.sql
-- Published venues: the canonical, player-facing destinations.
--
-- A venue is "a place a player would recognise and check into" — not one OSM
-- object (docs/reference.md §3.1). A park with two hoops is one venue; a
-- complex with four sports is one venue. That is why source records and
-- candidates are separate concepts and never write here directly.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
-- Enums rather than CHECK constraints so `supabase gen types` emits real union
-- types. The client then cannot compare against a status that does not exist.

create type public.indoor_state as enum ('indoor', 'outdoor', 'unknown');

-- Publication state. Deliberately separate from verification: whether a venue
-- is listed and how much we trust it are different questions (§5.6).
create type public.venue_status as enum ('active', 'merged', 'removed');

create type public.verification_state as enum (
  'unverified',
  'admin_verified',
  -- Reserved. No automatic path into this state until thresholds can be
  -- calibrated against real location-gated check-in data.
  'community_verified'
);

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------

create table public.venues (
  id                 uuid primary key default gen_random_uuid(),
  region_id          bigint      not null references public.regions (id) on delete restrict,
  name               text        not null,
  location           extensions.geography(Point, 4326) not null,
  address_text       text,
  indoor_state       public.indoor_state       not null default 'unknown',
  status             public.venue_status       not null default 'active',
  verification_state public.verification_state not null default 'unverified',
  verified_at        timestamptz,
  verified_by        uuid references auth.users (id) on delete set null,
  verification_method text,
  -- A merged venue survives as a pointer rather than being deleted: check-ins
  -- and run series already reference it, and destroying that row would destroy
  -- history. Retrofitting this after launch means a migration plus a backfill
  -- plus touching every read query.
  merged_into_venue_id uuid references public.venues (id) on delete restrict,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint venues_name_length check (char_length(btrim(name)) between 2 and 120),
  -- The two halves of the merge invariant, stated separately so a violation
  -- names which half failed.
  constraint venues_merged_requires_target check (
    status <> 'merged' or merged_into_venue_id is not null
  ),
  constraint venues_unmerged_has_no_target check (
    status = 'merged' or merged_into_venue_id is null
  ),
  constraint venues_no_self_merge check (merged_into_venue_id is distinct from id)
);

comment on table public.venues is
  'Canonical player-facing venues. Written only by review/merge RPCs, never directly by an import.';
comment on column public.venues.merged_into_venue_id is
  'Set when this venue was merged away. The row is kept so existing check-ins and links still resolve.';

create index venues_location_idx on public.venues using gist (location);
create index venues_region_status_idx on public.venues (region_id, status);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- venue_sports
-- ---------------------------------------------------------------------------

create table public.venue_sports (
  venue_id   uuid   not null references public.venues (id) on delete cascade,
  sport_id   bigint not null references public.sports (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (venue_id, sport_id)
);

create index venue_sports_sport_idx on public.venue_sports (sport_id);

-- ---------------------------------------------------------------------------
-- venue_aliases
-- ---------------------------------------------------------------------------
-- Improves search and preserves a merged venue's old name, so somebody
-- searching for the name they know still finds the surviving venue.

create table public.venue_aliases (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  alias      text not null,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),

  constraint venue_aliases_alias_length check (char_length(btrim(alias)) between 2 and 120),
  unique (venue_id, alias)
);

create index venue_aliases_venue_idx on public.venue_aliases (venue_id);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.venues        from anon, authenticated;
revoke all on public.venue_sports  from anon, authenticated;
revoke all on public.venue_aliases from anon, authenticated;

alter table public.venues        enable row level security;
alter table public.venue_sports  enable row level security;
alter table public.venue_aliases enable row level security;

-- Only active venues are publicly discoverable (§5.1). A merged venue stays
-- readable so an old deep link can resolve and redirect to its canonical
-- venue rather than 404ing; a removed venue does not.
create policy venues_select_public
  on public.venues for select to anon, authenticated
  using (status in ('active', 'merged') or public.is_admin());

create policy venues_write_admin
  on public.venues for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;

create policy venue_sports_select_public
  on public.venue_sports for select to anon, authenticated
  using (
    exists (
      select 1 from public.venues v
       where v.id = venue_id and (v.status in ('active', 'merged') or public.is_admin())
    )
  );

create policy venue_sports_write_admin
  on public.venue_sports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venue_sports to anon, authenticated;
grant insert, update, delete on public.venue_sports to authenticated;

create policy venue_aliases_select_public
  on public.venue_aliases for select to anon, authenticated
  using (true);

create policy venue_aliases_write_admin
  on public.venue_aliases for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.venue_aliases to anon, authenticated;
grant insert, update, delete on public.venue_aliases to authenticated;

-- Source: 20260818100100_activity.sql
-- Live activity: check-ins, arrival intents, and venue condition reports.
--
-- Everything here expires. The product's credibility rests on activity
-- disappearing on its own — "the app says five people are here, nobody is"
-- destroys trust within a week — so expiry is expressed as a query predicate
-- and never depends on a cleanup job having run.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.check_in_end_reason as enum ('checkout', 'expired', 'replaced', 'admin');

-- Venue Pulse: one structured, expiring state per live check-in. Deliberately
-- a closed set rather than free text — this is a status broadcast, not a chat
-- thread, and a fixed vocabulary is what makes it aggregatable.
create type public.venue_pulse as enum (
  'need_players',
  'game_on',
  'full_next_game',
  'wrapping_up'
);

create type public.venue_condition_kind as enum (
  'lights_on',
  'lights_off',
  'wet_surface',
  'locked',
  'crowded',
  'equipment_issue'
);

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------

create table public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid   not null references auth.users (id) on delete cascade,
  venue_id   uuid   not null references public.venues (id) on delete restrict,
  -- Denormalized from the venue and validated by the RPC. Realtime filters on
  -- a single column, so a subscriber can watch one region without a join.
  region_id  bigint not null references public.regions (id) on delete restrict,
  sport_id   bigint not null references public.sports (id) on delete restrict,
  party_size smallint not null default 1,
  note       text,
  pulse      public.venue_pulse,

  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at   timestamptz,
  end_reason public.check_in_end_reason,

  -- Location evidence, NOT location history. The device coordinate is used
  -- inside the RPC transaction to compute these and is then discarded (§5.3).
  -- Storing the point would build exactly the tracking database this product
  -- promises not to keep.
  location_verified   boolean not null default false,
  distance_to_venue_m numeric(8, 1),
  reported_accuracy_m numeric(8, 1),

  created_at timestamptz not null default now(),

  constraint check_ins_party_size_range check (party_size between 1 and 20),
  constraint check_ins_note_length check (note is null or char_length(note) <= 120),
  constraint check_ins_expires_after_start check (expires_at > started_at),
  -- Four hours is the hard ceiling, including extensions (§5.2).
  constraint check_ins_max_window check (expires_at <= started_at + interval '4 hours'),
  constraint check_ins_ended_has_reason check (
    (ended_at is null and end_reason is null) or (ended_at is not null and end_reason is not null)
  )
);

comment on table public.check_ins is
  'Live presence. Active means: ended_at is null AND expires_at > now(). Never trust a cleanup job for that.';
comment on column public.check_ins.party_size is
  'Includes the checked-in user. Venue counts SUM this rather than counting rows — someone who brought four friends is five players.';

-- One open check-in per user, enforced by the database rather than by client
-- logic. now() cannot appear in an index predicate, so this covers "not yet
-- ended"; the create RPC closes an already-expired open row first.
create unique index check_ins_one_open_per_user
  on public.check_ins (user_id)
  where ended_at is null;

create index check_ins_venue_active_idx on public.check_ins (venue_id, expires_at)
  where ended_at is null;
create index check_ins_region_active_idx on public.check_ins (region_id, expires_at)
  where ended_at is null;
create index check_ins_user_idx on public.check_ins (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- arrival_intents  ("Heading There")
-- ---------------------------------------------------------------------------
-- Solves cold start: an empty court stays empty because nobody wants to commit
-- first. An intent is a much cheaper signal than a check-in, and it is kept
-- structurally separate so it can NEVER inflate the verified "here now" count.

create table public.arrival_intents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid   not null references auth.users (id) on delete cascade,
  venue_id     uuid   not null references public.venues (id) on delete restrict,
  region_id    bigint not null references public.regions (id) on delete restrict,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  eta_minutes  smallint not null,
  expires_at   timestamptz not null,
  cancelled_at timestamptz,
  -- Set when the intent turned into a real check-in, so it stops counting
  -- without looking like the user simply gave up.
  fulfilled_by_check_in_id uuid references public.check_ins (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint arrival_intents_eta_allowed check (eta_minutes in (15, 30, 60)),
  constraint arrival_intents_expiry_future check (expires_at > created_at)
);

comment on table public.arrival_intents is
  'Lightweight "on my way" signal. Counted and displayed separately from check-ins; never added to the here-now total.';

create unique index arrival_intents_one_open_per_user
  on public.arrival_intents (user_id)
  where cancelled_at is null and fulfilled_by_check_in_id is null;

create index arrival_intents_venue_active_idx
  on public.arrival_intents (venue_id, expires_at)
  where cancelled_at is null and fulfilled_by_check_in_id is null;

-- ---------------------------------------------------------------------------
-- venue_conditions
-- ---------------------------------------------------------------------------
-- Short-lived, structured facts about a place right now. These never become
-- permanent venue attributes automatically — "locked" on a Sunday is not the
-- same claim as "this venue is locked".

create table public.venue_conditions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues (id) on delete cascade,
  kind        public.venue_condition_kind not null,
  -- Retained for abuse handling. Never exposed through a public read path.
  reported_by uuid not null references auth.users (id) on delete cascade,
  note        text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint venue_conditions_note_length check (note is null or char_length(note) <= 120),
  constraint venue_conditions_expiry_future check (expires_at > created_at)
);

create index venue_conditions_venue_active_idx
  on public.venue_conditions (venue_id, expires_at);

-- One live report of a given kind per venue per reporter, so a single user
-- cannot make "wet surface" look like a consensus.
create unique index venue_conditions_one_per_kind_per_reporter
  on public.venue_conditions (venue_id, kind, reported_by)
  where expires_at > '-infinity';

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.check_ins        from anon, authenticated;
revoke all on public.arrival_intents  from anon, authenticated;
revoke all on public.venue_conditions from anon, authenticated;

alter table public.check_ins        enable row level security;
alter table public.arrival_intents  enable row level security;
alter table public.venue_conditions enable row level security;

-- Signed-in users see currently-active check-ins. Expired ones collapse to
-- owner-only, so the table never becomes a public history of where people
-- have been. Anonymous browsers get aggregate counts through the discovery
-- RPCs instead of row access.
create policy check_ins_select_active_or_own
  on public.check_ins for select to authenticated
  using (
    user_id = (select auth.uid())
    or (ended_at is null and expires_at > now())
    or public.is_admin()
  );

-- No direct INSERT/UPDATE policy: writes go through create_check_in(),
-- end_check_in() and extend_check_in(), which validate location, duration and
-- the one-open-check-in rule transactionally.
grant select on public.check_ins to authenticated;

create policy arrival_intents_select_active_or_own
  on public.arrival_intents for select to authenticated
  using (
    user_id = (select auth.uid())
    or (cancelled_at is null and fulfilled_by_check_in_id is null and expires_at > now())
    or public.is_admin()
  );

grant select on public.arrival_intents to authenticated;

-- Conditions are readable while live, by anyone — a locked gate is worth
-- knowing before you travel, signed in or not. reported_by is withheld by
-- column grant rather than by policy.
create policy venue_conditions_select_live
  on public.venue_conditions for select to anon, authenticated
  using (expires_at > now() or reported_by = (select auth.uid()) or public.is_admin());

grant select (id, venue_id, kind, note, expires_at, created_at)
  on public.venue_conditions to anon, authenticated;

-- Source: 20260818100200_runs.sql
-- Recurring runs: the half of the product that has content before anyone has
-- checked in anywhere. "Tuesday 7pm regulars" is useful with zero live users.

create type public.run_series_status as enum ('active', 'inactive', 'removed');
create type public.run_exception_status as enum ('cancelled', 'rescheduled');

create table public.run_series (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid   not null references auth.users (id) on delete cascade,
  venue_id     uuid   not null references public.venues (id) on delete restrict,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  region_id    bigint not null references public.regions (id) on delete restrict,

  -- Local recurrence values, NOT a single UTC instant. A 7pm run has to stay
  -- at 7pm across a daylight-saving change instead of silently becoming 6pm,
  -- and that is only expressible by storing the local time plus a zone.
  weekday          smallint not null,
  local_start_time time     not null,
  local_end_time   time     not null,
  timezone         text     not null,

  starts_on   date not null,
  -- A series expires unless renewed. An organiser who loses interest should
  -- stop misleading people within weeks, not months.
  valid_until date not null,

  title            text,
  description      text,
  expected_players smallint,
  status           public.run_series_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint run_series_weekday_range check (weekday between 0 and 6),
  constraint run_series_time_order check (local_end_time > local_start_time),
  constraint run_series_valid_until_after_start check (valid_until >= starts_on),
  constraint run_series_max_12_weeks check (valid_until <= starts_on + interval '12 weeks'),
  constraint run_series_title_length check (title is null or char_length(btrim(title)) <= 80),
  constraint run_series_description_length check (
    description is null or char_length(description) <= 300
  ),
  constraint run_series_expected_players_range check (
    expected_players is null or expected_players between 2 and 100
  )
);

comment on table public.run_series is
  'Weekly recurring sessions. Local time + IANA zone so DST transitions stay correct; valid_until forces renewal.';

create index run_series_venue_idx on public.run_series (venue_id) where status = 'active';
create index run_series_region_idx on public.run_series (region_id, weekday) where status = 'active';
create index run_series_organizer_idx on public.run_series (organizer_id);

create trigger run_series_set_updated_at
  before update on public.run_series
  for each row execute function public.set_updated_at();

create trigger run_series_assert_valid_timezone
  before insert or update of timezone on public.run_series
  for each row execute function public.assert_valid_timezone();

-- ---------------------------------------------------------------------------
-- run_exceptions
-- ---------------------------------------------------------------------------
-- One-off deviations. Cancelling a single week must not require destroying and
-- recreating the series, which would lose its history and its renewal date.

create table public.run_exceptions (
  id              uuid primary key default gen_random_uuid(),
  run_series_id   uuid not null references public.run_series (id) on delete cascade,
  occurrence_date date not null,
  status          public.run_exception_status not null,
  replacement_start_at timestamptz,
  replacement_end_at   timestamptz,
  note            text,
  created_at      timestamptz not null default now(),

  unique (run_series_id, occurrence_date),
  constraint run_exceptions_reschedule_has_times check (
    status <> 'rescheduled'
    or (replacement_start_at is not null and replacement_end_at is not null
        and replacement_end_at > replacement_start_at)
  ),
  constraint run_exceptions_cancel_has_no_times check (
    status <> 'cancelled'
    or (replacement_start_at is null and replacement_end_at is null)
  ),
  constraint run_exceptions_note_length check (note is null or char_length(note) <= 120)
);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

revoke all on public.run_series     from anon, authenticated;
revoke all on public.run_exceptions from anon, authenticated;

alter table public.run_series     enable row level security;
alter table public.run_exceptions enable row level security;

-- Active, unexpired series are public — discovering a run should not require
-- an account. The organiser always sees their own, including expired ones, so
-- they can renew.
create policy run_series_select_public
  on public.run_series for select to anon, authenticated
  using (
    (status = 'active' and valid_until >= current_date)
    or organizer_id = (select auth.uid())
    or public.is_admin()
  );

grant select on public.run_series to anon, authenticated;

create policy run_exceptions_select_public
  on public.run_exceptions for select to anon, authenticated
  using (
    exists (
      select 1 from public.run_series s
       where s.id = run_series_id
         and ((s.status = 'active' and s.valid_until >= current_date)
              or s.organizer_id = (select auth.uid())
              or public.is_admin())
    )
  );

grant select on public.run_exceptions to anon, authenticated;

-- Writes go through create_run() / create_run_at_pin() to open a series, and
-- edit_run_session() / cancel_run_session() to change one occurrence, so the
-- 12-week limit, timezone validity and organiser ownership are checked in one
-- place rather than in each client.
--
-- There is no renewal RPC yet: a series stops appearing once valid_until
-- passes, and the organiser's only route back is to create a new one.

-- Source: 20260818100300_discovery.sql
-- Read-side RPCs powering discovery.
--
-- All of these are SECURITY DEFINER for one specific reason: an anonymous
-- browser must be able to see that six people are playing at a court without
-- being able to read the check_ins table. The functions expose aggregates, the
-- policies keep the rows private, and the two do not conflict.

-- Trigram similarity, used to rank duplicate candidates by name. Distance
-- alone cannot tell "Victoria Park courts" from an unrelated court nearby.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- upcoming_runs
-- ---------------------------------------------------------------------------
-- Materializes weekly series into concrete occurrences inside a bounded window.
--
-- The DST-correct part is `(day + local_start_time) at time zone tz`: the local
-- wall-clock time is constructed first and only then resolved to an instant.
-- Storing one UTC timestamp instead would silently shift a 7pm run to 6pm the
-- week the clocks change.

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
           p_from + make_interval(days => greatest(p_days, 1)) as to_ts
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
       and s.valid_until >= current_date
       and (p_region_id is null or s.region_id = p_region_id)
       and (p_venue_id is null or s.venue_id = p_venue_id)
       and (p_sport_ids is null or s.sport_id = any (p_sport_ids))
       and d::date between s.starts_on and s.valid_until
       and extract(dow from d)::smallint = s.weekday
  ),
  resolved as (
    select s.id,
           s.venue_id,
           s.sport_id,
           s.organizer_id,
           s.title,
           s.description,
           s.expected_players,
           s.valid_until,
           c.occurrence_date,
           e.status as exception_status,
           coalesce(
             e.replacement_start_at,
             (c.occurrence_date + s.local_start_time) at time zone s.timezone
           ) as starts_at,
           coalesce(
             e.replacement_end_at,
             (c.occurrence_date + s.local_end_time) at time zone s.timezone
           ) as ends_at
      from candidate_days c
      join public.run_series s on s.id = c.series_id
      left join public.run_exceptions e
             on e.run_series_id = s.id and e.occurrence_date = c.occurrence_date
  )
  select r.id,
         r.venue_id,
         v.name,
         r.sport_id,
         sp.slug,
         sp.name,
         r.organizer_id,
         pr.display_name,
         r.title,
         r.description,
         r.expected_players,
         v.indoor_state,
         r.starts_at,
         r.ends_at,
         r.occurrence_date,
         r.exception_status = 'rescheduled',
         r.valid_until,
         extensions.ST_Y(v.location::extensions.geometry),
         extensions.ST_X(v.location::extensions.geometry)
    from resolved r
    join public.venues v on v.id = r.venue_id and v.status = 'active'
    join public.sports sp on sp.id = r.sport_id
    left join public.profiles pr on pr.id = r.organizer_id
    cross join window_bounds w
   where r.exception_status is distinct from 'cancelled'
     -- A session already under way is still worth showing, so compare against
     -- the end time rather than the start.
     and r.ends_at >= w.from_ts
     and r.starts_at <= w.to_ts
   order by r.starts_at asc
$$;

comment on function public.upcoming_runs is
  'Weekly series expanded into occurrences within a bounded window, DST-correct, with cancellations and reschedules applied.';

grant execute on function public.upcoming_runs(bigint, bigint[], uuid, timestamptz, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- nearby_venues
-- ---------------------------------------------------------------------------

create or replace function public.nearby_venues(
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
  pulse              public.venue_pulse,
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
         live.pulse,
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
             max(c.started_at)          as last_activity_at,
             -- One pulse per venue: the most recent check-in's, since that is
             -- the freshest read on what is actually happening.
             (array_agg(c.pulse order by c.started_at desc)
                filter (where c.pulse is not null))[1] as pulse
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

-- ---------------------------------------------------------------------------
-- venue_details
-- ---------------------------------------------------------------------------

create or replace function public.venue_details(p_venue_id uuid)
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
  pulse              public.venue_pulse,
  last_activity_at   timestamptz,
  aliases            text[]
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
         live.pulse,
         live.last_activity_at,
         coalesce(al.aliases, array[]::text[])
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
             max(c.started_at)          as last_activity_at,
             (array_agg(c.pulse order by c.started_at desc)
                filter (where c.pulse is not null))[1] as pulse
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
      select array_agg(a.alias) as aliases
        from public.venue_aliases a where a.venue_id = v.id
    ) al on true
$$;

comment on function public.venue_details is
  'One public venue payload. Resolves a merged id to its canonical venue so old links keep working.';

grant execute on function public.venue_details(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- venue_activity — who is here, without exposing history
-- ---------------------------------------------------------------------------

create or replace function public.venue_activity(p_venue_id uuid)
returns table (
  kind         text,
  display_name text,
  avatar_path  text,
  sport_slug   text,
  party_size   smallint,
  note         text,
  pulse        public.venue_pulse,
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
         c.pulse,
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

   order by 1, 8 desc
$$;

grant execute on function public.venue_activity(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- find_duplicate_candidates
-- ---------------------------------------------------------------------------
-- Lives in Postgres, not in the importer, because user submissions arrive
-- through the app and would never reach importer-side logic. One definition,
-- one threshold to tune, both entry points covered.
--
-- It PROPOSES. It never merges. Two courts 6 m apart may be one venue or two,
-- and only a person who knows the place can say which.

create or replace function public.find_duplicate_candidates(
  p_lat       double precision,
  p_lon       double precision,
  p_sport_ids bigint[] default null,
  p_radius_m  double precision default 100,
  p_exclude_venue_id uuid default null,
  p_name      text default null
)
returns table (
  venue_id           uuid,
  name               text,
  distance_m         double precision,
  shared_sport_count integer,
  name_similarity    real,
  score              double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select v.id,
         v.name,
         extensions.ST_Distance(v.location, o.g) as distance_m,
         coalesce(shared.n, 0)::integer,
         case when p_name is null then 0::real
              else extensions.similarity(lower(v.name), lower(p_name)) end,
         -- Distance alone is never enough (§9). Proximity dominates, shared
         -- sports corroborate, and name similarity breaks ties — a "Victoria
         -- Park" 80 m away is a likelier duplicate than an unrelated court at 30 m.
         (1.0 - least(extensions.ST_Distance(v.location, o.g) / greatest(p_radius_m, 1), 1.0)) * 0.6
         + least(coalesce(shared.n, 0), 3) / 3.0 * 0.25
         + case when p_name is null then 0
                else extensions.similarity(lower(v.name), lower(p_name)) * 0.15 end
      as score
    from public.venues v
    cross join origin o
    left join lateral (
      select count(*) as n
        from public.venue_sports vs
       where vs.venue_id = v.id
         and p_sport_ids is not null
         and vs.sport_id = any (p_sport_ids)
    ) shared on true
   where v.status = 'active'
     and (p_exclude_venue_id is null or v.id <> p_exclude_venue_id)
     and extensions.ST_DWithin(v.location, o.g, p_radius_m)
   order by score desc, distance_m asc
$$;

comment on function public.find_duplicate_candidates is
  'Ranks nearby active venues as possible duplicates. Proposes only — merging is always a human decision.';

grant execute on function public.find_duplicate_candidates(double precision, double precision, bigint[], double precision, uuid, text)
  to authenticated;

-- Source: 20260903090000_venue_submissions.sql
-- User-submitted venues enter a private moderation queue. They never write
-- directly to public.venues, and proximity only proposes possible duplicates.

create type public.venue_candidate_status as enum (
  'pending',
  'possible_duplicate',
  'approved',
  'merged',
  'rejected'
);

create type public.venue_candidate_sport_origin as enum ('submitted', 'reviewer');

create table public.venue_candidates (
  id                    uuid primary key default gen_random_uuid(),
  region_id             bigint not null references public.regions (id) on delete restrict,
  submitted_by          uuid not null references auth.users (id) on delete restrict,
  proposed_name         text not null,
  address_text          text,
  location              extensions.geography(Point, 4326) not null,
  indoor_state          public.indoor_state not null,
  status                public.venue_candidate_status not null default 'pending',
  duplicate_of_venue_id uuid references public.venues (id) on delete set null,
  published_venue_id    uuid references public.venues (id) on delete set null,
  reviewed_by           uuid references auth.users (id) on delete set null,
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint venue_candidates_name_length
    check (char_length(btrim(proposed_name)) between 2 and 120),
  constraint venue_candidates_address_length
    check (address_text is null or char_length(address_text) <= 240),
  constraint venue_candidates_review_note_length
    check (review_note is null or char_length(review_note) <= 1000)
);

create index venue_candidates_location_idx on public.venue_candidates using gist (location);
create index venue_candidates_submitter_idx on public.venue_candidates (submitted_by, created_at desc);
create index venue_candidates_review_queue_idx
  on public.venue_candidates (status, created_at)
  where status in ('pending', 'possible_duplicate');

create trigger venue_candidates_set_updated_at
  before update on public.venue_candidates
  for each row execute function public.set_updated_at();

create table public.venue_candidate_sports (
  candidate_id uuid not null references public.venue_candidates (id) on delete cascade,
  sport_id     bigint not null references public.sports (id) on delete restrict,
  origin       public.venue_candidate_sport_origin not null default 'submitted',
  created_at   timestamptz not null default now(),
  primary key (candidate_id, sport_id)
);

create table public.venue_candidate_matches (
  candidate_id       uuid not null references public.venue_candidates (id) on delete cascade,
  venue_id           uuid not null references public.venues (id) on delete cascade,
  distance_m         double precision not null check (distance_m >= 0),
  shared_sport_count integer not null check (shared_sport_count >= 0),
  name_similarity    real not null check (name_similarity between 0 and 1),
  score              double precision not null,
  created_at         timestamptz not null default now(),
  primary key (candidate_id, venue_id)
);

revoke all on public.venue_candidates        from anon, authenticated;
revoke all on public.venue_candidate_sports  from anon, authenticated;
revoke all on public.venue_candidate_matches from anon, authenticated;

alter table public.venue_candidates        enable row level security;
alter table public.venue_candidate_sports  enable row level security;
alter table public.venue_candidate_matches enable row level security;

create policy venue_candidates_select_owner_or_admin
  on public.venue_candidates for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_admin());

create policy venue_candidate_sports_select_owner_or_admin
  on public.venue_candidate_sports for select to authenticated
  using (
    exists (
      select 1
        from public.venue_candidates c
       where c.id = candidate_id
         and (c.submitted_by = (select auth.uid()) or public.is_admin())
    )
  );

create policy venue_candidate_matches_select_owner_or_admin
  on public.venue_candidate_matches for select to authenticated
  using (
    exists (
      select 1
        from public.venue_candidates c
       where c.id = candidate_id
         and (c.submitted_by = (select auth.uid()) or public.is_admin())
    )
  );

grant select on public.venue_candidates,
                public.venue_candidate_sports,
                public.venue_candidate_matches
  to authenticated;

-- The only player write path. SECURITY DEFINER is required because candidates
-- and their cached duplicate evidence cannot be inserted or status-edited
-- directly through the Data API.
create or replace function public.submit_venue(
  p_name         text,
  p_lat          double precision,
  p_lon          double precision,
  p_sport_ids    bigint[],
  p_indoor_state public.indoor_state,
  p_address_text text default null
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
    region_id, submitted_by, proposed_name, address_text, location, indoor_state
  ) values (
    v_region_id,
    v_user_id,
    v_name,
    v_address,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography,
    p_indoor_state
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

comment on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text) is
  'Creates a private user venue candidate at the final confirmed coordinate and caches possible duplicate matches.';

revoke all on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text)
  from public, anon;
grant execute on function public.submit_venue(text, double precision, double precision, bigint[], public.indoor_state, text)
  to authenticated;

-- Source: 20260904090000_account_profiles.sql
-- Transactional owner profile updates for onboarding and account settings.
-- The public profile table remains protected by its existing column grants;
-- callers receive only their own complete row from this RPC.

create or replace function public.update_own_profile(
  p_display_name text,
  p_sport_ids bigint[],
  p_complete_onboarding boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := btrim(p_display_name);
  v_sport_count integer;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if char_length(v_display_name) not between 2 and 40 then
    raise exception 'Display name must be between 2 and 40 characters'
      using errcode = '22023';
  end if;

  if p_sport_ids is null then
    p_sport_ids := array[]::bigint[];
  end if;

  select count(distinct s.id)::integer
    into v_sport_count
    from public.sports s
   where s.id = any (p_sport_ids)
     and s.is_active;

  if v_sport_count <> (select count(distinct x) from unnest(p_sport_ids) x) then
    raise exception 'Every selected sport must exist and be active' using errcode = '22023';
  end if;

  update public.profiles p
     set display_name = v_display_name,
         onboarding_completed_at = case
           when p_complete_onboarding then coalesce(p.onboarding_completed_at, now())
           else p.onboarding_completed_at
         end
   where p.id = v_user_id
   returning p.* into v_profile;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  delete from public.profile_sports ps where ps.profile_id = v_user_id;

  insert into public.profile_sports (profile_id, sport_id)
  select v_user_id, s.id
    from public.sports s
   where s.id = any (p_sport_ids);

  return v_profile;
end
$$;

comment on function public.update_own_profile(text, bigint[], boolean) is
  'Transactionally updates the caller display name, onboarding state, and private sport preferences.';

revoke all on function public.update_own_profile(text, bigint[], boolean) from public, anon;
grant execute on function public.update_own_profile(text, bigint[], boolean) to authenticated;

-- Source: 20260904120000_session_social.sql
-- Dated run sessions, participant-only chat, and a public regional activity
-- feed. A recurring run is a template; this migration gives an individual
-- week's occurrence a stable identity that messages and media can reference.

create type public.session_member_role as enum ('organizer', 'player');
create type public.session_media_kind as enum ('image', 'video');

create table public.run_sessions (
  id              uuid primary key default gen_random_uuid(),
  run_series_id   uuid not null references public.run_series (id) on delete cascade,
  occurrence_date date not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  venue_id        uuid not null references public.venues (id) on delete restrict,
  sport_id        bigint not null references public.sports (id) on delete restrict,
  region_id       bigint not null references public.regions (id) on delete restrict,
  created_at      timestamptz not null default now(),

  unique (run_series_id, occurrence_date),
  constraint run_sessions_time_order check (ends_at > starts_at)
);

create table public.session_memberships (
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.session_member_role not null default 'player',
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.session_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  constraint session_messages_body_length check (
    char_length(btrim(body)) between 1 and 1000
  )
);

create table public.session_posts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.run_sessions (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  caption    text,
  created_at timestamptz not null default now(),

  constraint session_posts_caption_length check (
    caption is null or char_length(btrim(caption)) between 1 and 500
  )
);

create table public.session_media (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.session_posts (id) on delete cascade,
  uploader_id      uuid not null references auth.users (id) on delete cascade,
  kind             public.session_media_kind not null,
  storage_path     text unique,
  remote_url       text,
  width            integer,
  height           integer,
  duration_seconds numeric(6,2),
  created_at       timestamptz not null default now(),

  constraint session_media_has_one_source check (
    (storage_path is not null)::integer + (remote_url is not null)::integer = 1
  ),
  constraint session_media_path_safe check (
    storage_path is null
    or (storage_path = btrim(storage_path) and storage_path !~ '(^|/)\.\.(/|$)')
  ),
  constraint session_media_remote_url_safe check (
    remote_url is null or remote_url ~ '^https://'
  ),
  constraint session_media_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint session_media_video_duration check (
    (kind = 'image' and duration_seconds is null)
    or (kind = 'video' and duration_seconds > 0 and duration_seconds <= 30)
  )
);

create index session_memberships_user_idx
  on public.session_memberships (user_id, joined_at desc);
create index session_messages_session_idx
  on public.session_messages (session_id, created_at);
create index session_posts_created_idx
  on public.session_posts (created_at desc);
create index run_sessions_region_idx
  on public.run_sessions (region_id, starts_at desc);

-- SECURITY DEFINER avoids recursive membership RLS checks. It exposes only a
-- boolean for the current user and never returns the membership row.
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.session_memberships m
     where m.session_id = p_session_id
       and m.user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_session_member(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;

revoke all on public.run_sessions, public.session_memberships,
  public.session_messages, public.session_posts, public.session_media
  from anon, authenticated;

alter table public.run_sessions enable row level security;
alter table public.session_memberships enable row level security;
alter table public.session_messages enable row level security;
alter table public.session_posts enable row level security;
alter table public.session_media enable row level security;

create policy run_sessions_select_public
  on public.run_sessions for select to anon, authenticated using (true);
grant select on public.run_sessions to anon, authenticated;

create policy session_memberships_select_session
  on public.session_memberships for select to authenticated
  using (public.is_session_member(session_id));
grant select on public.session_memberships to authenticated;

create policy session_messages_select_member
  on public.session_messages for select to authenticated
  using (public.is_session_member(session_id));
create policy session_messages_insert_member
  on public.session_messages for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_session_member(session_id)
  );
grant select, insert on public.session_messages to authenticated;

create policy session_posts_select_public
  on public.session_posts for select to anon, authenticated using (true);
create policy session_posts_insert_member
  on public.session_posts for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.is_session_member(session_id)
  );
create policy session_posts_delete_own
  on public.session_posts for delete to authenticated
  using (author_id = (select auth.uid()));
grant select on public.session_posts to anon, authenticated;
grant insert, delete on public.session_posts to authenticated;

create policy session_media_select_public
  on public.session_media for select to anon, authenticated using (true);
create policy session_media_insert_member
  on public.session_media for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and exists (
      select 1 from public.session_posts p
       where p.id = post_id
         and p.author_id = (select auth.uid())
         and public.is_session_member(p.session_id)
    )
  );
create policy session_media_delete_own
  on public.session_media for delete to authenticated
  using (uploader_id = (select auth.uid()));
grant select on public.session_media to anon, authenticated;
grant insert, delete on public.session_media to authenticated;

-- Lazily materialize one valid dated occurrence and join the caller. The
-- organizer is always added as a member, even when another player joins first.
create or replace function public.join_run_session(
  p_run_series_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run record;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found then
    raise exception 'run occurrence is unavailable' using errcode = '22023';
  end if;

  insert into public.run_sessions (
    run_series_id, occurrence_date, starts_at, ends_at,
    venue_id, sport_id, region_id
  )
  select v_run.run_series_id, v_run.occurrence_date, v_run.starts_at,
         v_run.ends_at, v_run.venue_id, v_run.sport_id, s.region_id
    from public.run_series s
   where s.id = v_run.run_series_id
  on conflict (run_series_id, occurrence_date) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id into v_session_id;

  insert into public.session_memberships (session_id, user_id, role)
  values (v_session_id, v_run.organizer_id, 'organizer')
  on conflict (session_id, user_id) do update set role = 'organizer';

  insert into public.session_memberships (session_id, user_id, role)
  values (
    v_session_id,
    v_user_id,
    (case when v_user_id = v_run.organizer_id then 'organizer'
          else 'player' end)::public.session_member_role
  )
  on conflict (session_id, user_id) do nothing;

  return v_session_id;
end
$$;

revoke all on function public.join_run_session(uuid, date) from public;
grant execute on function public.join_run_session(uuid, date) to authenticated;

-- Public uploads are immutable objects; metadata and ownership still live in
-- public.session_media. Paths begin with the uploader's user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-media', 'session-media', true, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy session_media_objects_insert_own_folder
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy session_media_objects_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'session-media'
    and owner_id = (select auth.uid())::text
  );

-- Source: 20260905210000_session_storage_access.sql
-- Uploads must belong to a post authored by the caller in a joined session.
drop policy session_media_objects_insert_own_folder on storage.objects;

create policy session_media_objects_insert_own_folder
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2]
        and p.author_id = (select auth.uid())
        and public.is_session_member(p.session_id)
    )
  );

-- Storage's remove API needs SELECT as well as DELETE for owned objects.
create policy session_media_objects_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-media'
    and owner_id = (select auth.uid())::text
  );

alter table public.session_media add constraint session_media_owned_path check (
  storage_path is null or (
    split_part(storage_path, '/', 1) = uploader_id::text
    and split_part(storage_path, '/', 2) = post_id::text
  )
);

-- Source: 20260905211000_signup_profile_name.sql
-- Signup must work for short/long email local parts and arbitrary metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(new.raw_user_meta_data ->> 'display_name');
begin
  if v_name is null or char_length(v_name) < 2 then
    v_name := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if v_name is null or char_length(v_name) < 2 then
    v_name := 'Player';
  end if;
  v_name := btrim(left(v_name, 40));
  if char_length(v_name) < 2 then
    v_name := 'Player';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Source: 20260905212000_create_run.sql
-- Create a weekly run and its first dated session in one transaction.
create function public.create_run(
  p_venue_id uuid, p_sport_id bigint, p_starts_on date,
  p_start_time time, p_end_time time, p_weeks integer, p_title text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_timezone text;
  v_series uuid;
begin
  if v_user is null then
    raise exception 'Sign in to create a run' using errcode = '42501';
  end if;
  select v.region_id, r.timezone into v_region, v_timezone
  from public.venues v join public.regions r on r.id = v.region_id
  join public.venue_sports vs on vs.venue_id = v.id and vs.sport_id = p_sport_id
  join public.sports s on s.id = vs.sport_id and s.is_active
  where v.id = p_venue_id and v.status = 'active' and r.is_published;
  if not found then
    raise exception 'Choose an available venue and a sport played there' using errcode = '22023';
  end if;
  if p_starts_on is null or p_start_time is null or p_end_time is null
     or p_weeks is null or p_weeks not between 1 and 12
     or p_start_time >= p_end_time
     or p_starts_on > (now() at time zone v_timezone)::date + 84
     or (p_starts_on + p_start_time) at time zone v_timezone <= now()
     or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Use a future date within 12 weeks, an end time after the start, 1–12 weeks, and a title of 2–80 characters' using errcode = '22023';
  end if;
  insert into public.run_series (
    organizer_id, venue_id, sport_id, region_id, weekday,
    local_start_time, local_end_time, timezone, starts_on, valid_until, title
  ) values (
    v_user, p_venue_id, p_sport_id, v_region, extract(dow from p_starts_on)::smallint,
    p_start_time, p_end_time, v_timezone, p_starts_on, p_starts_on + (p_weeks - 1) * 7, btrim(p_title)
  ) returning id into v_series;
  return public.join_run_session(v_series, p_starts_on);
end;
$$;

revoke all on function public.create_run(uuid, bigint, date, time, time, integer, text) from public, anon;

grant execute on function public.create_run(uuid, bigint, date, time, time, integer, text) to authenticated;

-- Source: 20260905213000_reference_data.sql
-- Required reference data for hosted installs; excludes demo users and activity.
-- ---------------------------------------------------------------------------
-- Sports
-- ---------------------------------------------------------------------------
-- The recommended launch set (docs/product-rules.md §Open decisions).
-- ice_hockey is seeded inactive: it is well represented in PEI data but the
-- app is about pickup play, and rink access works differently. Flip is_active
-- when the owners decide — that decision is still open.

insert into public.sports (slug, name, is_active, sort_order) values
  ('basketball', 'Basketball', true,  10),
  ('soccer',     'Soccer',     true,  20),
  ('volleyball', 'Volleyball', true,  30),
  ('pickleball', 'Pickleball', true,  40),
  ('tennis',     'Tennis',     true,  50),
  ('ice-hockey', 'Ice Hockey', false, 60)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- OSM sport token aliases
-- ---------------------------------------------------------------------------
-- Mapped tokens: this OSM value means this sport.

insert into public.osm_sport_aliases (alias, sport_id, is_ignored, note)
select v.alias, s.id, false, v.note
from (values
  ('basketball',      'basketball', null),
  ('soccer',          'soccer',     'OSM''s preferred token for association football.'),
  ('five-a-side',     'soccer',     'Observed in London as soccer;five-a-side.'),
  ('seven-a-side',    'soccer',     'Observed in London as seven-a-side;five-a-side;soccer.'),
  ('futsal',          'soccer',     'No dedicated sport yet; futsal cages are usually tagged soccer + covered.'),
  ('volleyball',      'volleyball', null),
  ('beachvolleyball', 'volleyball', 'Observed in PEI. OSM writes it unspaced.'),
  ('beach_volleyball','volleyball', 'Less common spelling of the same thing.'),
  ('tennis',          'tennis',     null),
  ('pickleball',      'pickleball', 'Observed in PEI, often as tennis;pickleball on shared courts.'),
  ('ice_hockey',      'ice-hockey', 'Maps even though the sport is currently inactive.')
) as v(alias, sport_slug, note)
join public.sports s on s.slug = v.sport_slug
on conflict (alias) do nothing;

-- Ignored tokens: we know what these are and deliberately do not serve them.
-- Recording them explicitly is what keeps the UNKNOWN bucket meaningful — an
-- absent alias then genuinely means "OSM tagged something we have never seen".

insert into public.osm_sport_aliases (alias, sport_id, is_ignored, note)
select v.alias, null, true, v.note
from (values
  -- Field sports that are not pickup-friendly or need booked facilities
  ('baseball',           'Very common in PEI (81 elements) but not a pickup sport for us.'),
  ('softball',           null),
  ('cricket',            null),
  ('american_football',  null),
  ('rugby_union',        null),
  ('rugby_league',       null),
  ('field_hockey',       null),
  ('netball',            null),
  ('handball',           null),
  ('badminton',          null),
  ('table_tennis',       null),
  -- Individual / facility activities
  ('running',            null),
  ('athletics',          null),
  ('swimming',           null),
  ('cycling',            null),
  ('skateboard',         null),
  ('roller_skating',     null),
  ('skating',            null),
  ('ice_skating',        null),
  ('curling',            null),
  ('skiing',             null),
  ('climbing',           null),
  ('climbing_adventure', null),
  ('yoga',               null),
  ('fitness',            null),
  ('aerobics',           null),
  ('pilates',            null),
  ('golf',               null),
  ('archery',            null),
  ('shooting_range',     null),
  ('bowls',              null),
  ('boules',             null),
  ('petanque',           null),
  ('horseshoes',         null),
  ('croquet',            null),
  ('gaga',               'Observed in PEI. Playground game, not a venue sport.'),
  ('5pin',               'Five-pin bowling, observed inside PEI community centres.'),
  ('cycle_polo',         null),
  ('beach_tennis',       null),
  -- Motorsport / equestrian
  ('horse_racing',       null),
  ('equestrian',         null),
  ('motor',              null),
  ('karting',            null),
  -- Not a sport at all: says the pitch is multi-use, tells us nothing about
  -- which sport. Must be ignored rather than mapped.
  ('multi',              'Marks a multi-use pitch. Carries no sport information.')
) as v(alias, note)
on conflict (alias) do nothing;

-- Deliberately NOT seeded, so they surface as UNKNOWN for a human to decide:
--   'football' — ambiguous. In London data it appears as soccer;football
--                (association football), but a standalone sport=football in
--                North America usually means American football.
--   'hockey'   — ambiguous between ice and field hockey.
-- This is the alias table's third state doing its job. If review shows these
-- are always one thing in practice, add them then.

-- ---------------------------------------------------------------------------
-- Regions
-- ---------------------------------------------------------------------------
-- Charlottetown's box covers the city plus Stratford and Cornwall. A live
-- Overpass query over it returned 158 sport elements: 52 pickup-relevant with
-- a sport tag, 38 leisure=pitch with no sport tag at all, and 19 named in
-- total — no named basketball courts whatsoever. That is the review workload
-- Phase 1 is built to handle.

insert into public.regions (slug, name, min_lat, min_lon, max_lat, max_lon, timezone, is_published) values
  ('charlottetown', 'Charlottetown, PE', 46.190000, -63.240000, 46.300000, -63.030000, 'America/Halifax', true),
  -- Second region, imported but never published: proves the importer carries no
  -- region-specific constants without creating a review burden. Denser and
  -- differently shaped (spans a harbour), which is the point of the test.
  ('halifax',       'Halifax, NS',       44.580000, -63.700000, 44.740000, -63.480000, 'America/Halifax', false)
on conflict (slug) do nothing;

-- Source: 20260906090000_session_pins.sql
-- Session pins are public event locations, not reviewed canonical venues.
alter table public.run_series alter column venue_id drop not null;

alter table public.run_series alter column region_id drop not null;

alter table public.run_sessions alter column venue_id drop not null;

alter table public.run_sessions alter column region_id drop not null;

alter table public.run_series
  add column location_name text,
  add column latitude double precision,
  add column longitude double precision,
  add constraint run_series_pin_location check (
    (venue_id is not null and location_name is null and latitude is null and longitude is null)
    or (venue_id is null and location_name is not null and char_length(btrim(location_name)) between 2 and 120
      and latitude is not null and latitude between -90 and 90
      and longitude is not null and longitude between -180 and 180)
  );

alter table public.run_sessions
  add column location_name text,
  add column latitude double precision,
  add column longitude double precision,
  add constraint run_sessions_pin_location check (
    (venue_id is not null and location_name is null and latitude is null and longitude is null)
    or (venue_id is null and location_name is not null and char_length(btrim(location_name)) between 2 and 120
      and latitude is not null and latitude between -90 and 90
      and longitude is not null and longitude between -180 and 180)
  );

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
           p_from + make_interval(days => greatest(p_days, 1)) as to_ts
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
       and s.valid_until >= current_date
       and (p_region_id is null or s.region_id = p_region_id)
       and (p_venue_id is null or s.venue_id = p_venue_id)
       and (p_sport_ids is null or s.sport_id = any (p_sport_ids))
       and d::date between s.starts_on and s.valid_until
       and extract(dow from d)::smallint = s.weekday
  ),
  resolved as (
    select s.id,
           s.venue_id,
           s.location_name, s.latitude, s.longitude,
           s.sport_id,
           s.organizer_id,
           s.title,
           s.description,
           s.expected_players,
           s.valid_until,
           c.occurrence_date,
           e.status as exception_status,
           coalesce(
             e.replacement_start_at,
             (c.occurrence_date + s.local_start_time) at time zone s.timezone
           ) as starts_at,
           coalesce(
             e.replacement_end_at,
             (c.occurrence_date + s.local_end_time) at time zone s.timezone
           ) as ends_at
      from candidate_days c
      join public.run_series s on s.id = c.series_id
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
     and r.exception_status is distinct from 'cancelled'
     -- A session already under way is still worth showing, so compare against
     -- the end time rather than the start.
     and r.ends_at >= w.from_ts
     and r.starts_at <= w.to_ts
   order by r.starts_at asc
$$;

comment on function public.upcoming_runs is
  'Weekly series expanded into occurrences within a bounded window, DST-correct, with cancellations and reschedules applied.';

grant execute on function public.upcoming_runs(bigint, bigint[], uuid, timestamptz, integer)
  to anon, authenticated;

create or replace function public.join_run_session(
  p_run_series_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run record;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found then
    raise exception 'run occurrence is unavailable' using errcode = '22023';
  end if;

  insert into public.run_sessions (
    run_series_id, occurrence_date, starts_at, ends_at,
    venue_id, sport_id, region_id, location_name, latitude, longitude
  )
  select v_run.run_series_id, v_run.occurrence_date, v_run.starts_at,
         v_run.ends_at, v_run.venue_id, v_run.sport_id, s.region_id, s.location_name, s.latitude, s.longitude
    from public.run_series s
   where s.id = v_run.run_series_id
  on conflict (run_series_id, occurrence_date) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id into v_session_id;

  insert into public.session_memberships (session_id, user_id, role)
  values (v_session_id, v_run.organizer_id, 'organizer')
  on conflict (session_id, user_id) do update set role = 'organizer';

  insert into public.session_memberships (session_id, user_id, role)
  values (
    v_session_id,
    v_user_id,
    (case when v_user_id = v_run.organizer_id then 'organizer'
          else 'player' end)::public.session_member_role
  )
  on conflict (session_id, user_id) do nothing;

  return v_session_id;
end
$$;

revoke all on function public.join_run_session(uuid, date) from public;

grant execute on function public.join_run_session(uuid, date) to authenticated;

create function public.create_run_at_pin(
  p_lat double precision, p_lon double precision, p_location_name text,
  p_sport_id bigint, p_starts_on date, p_start_time time, p_end_time time,
  p_weeks integer, p_title text, p_timezone text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_region bigint;
  v_series uuid;
begin
  if v_user is null then raise exception 'Sign in to create a session' using errcode = '42501'; end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180
    or p_location_name is null or char_length(btrim(p_location_name)) not between 2 and 120 then
    raise exception 'Drop a valid pin and name the meeting spot' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid time zone' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sports where id = p_sport_id and is_active) then
    raise exception 'Choose an active sport' using errcode = '22023';
  end if;
  if p_starts_on is null or p_start_time is null or p_end_time is null
    or p_weeks is null or p_weeks not between 1 and 12 or p_start_time >= p_end_time
    or p_starts_on > (now() at time zone p_timezone)::date + 84
    or (p_starts_on + p_start_time) at time zone p_timezone <= now()
    or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Choose a future start, a later end time, 1–12 weeks, and a title of 2–80 characters' using errcode = '22023';
  end if;
  select id into v_region from public.regions
    where is_published and p_lat between min_lat and max_lat and p_lon between min_lon and max_lon
    order by (max_lat-min_lat)*(max_lon-min_lon) limit 1;
  insert into public.run_series (
    organizer_id, venue_id, region_id, sport_id, location_name, latitude, longitude,
    weekday, local_start_time, local_end_time, timezone, starts_on, valid_until, title
  ) values (
    v_user, null, v_region, p_sport_id, btrim(p_location_name), p_lat, p_lon,
    extract(dow from p_starts_on)::smallint, p_start_time, p_end_time, p_timezone,
    p_starts_on, p_starts_on + (p_weeks - 1)*7, btrim(p_title)
  ) returning id into v_series;
  return public.join_run_session(v_series, p_starts_on);
end;
$$;

revoke all on function public.create_run_at_pin(double precision, double precision, text, bigint, date, time, time, integer, text, text) from public, anon;

grant execute on function public.create_run_at_pin(double precision, double precision, text, bigint, date, time, time, integer, text, text) to authenticated;

-- Source: 20260906100000_session_controls.sql
-- Occurrence controls preserve chat/media history and the weekly template.
alter table public.run_sessions
  add column title text check (title is null or char_length(btrim(title)) between 2 and 80),
  add column cancelled_at timestamptz;

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
           p_from + make_interval(days => greatest(p_days, 1)) as to_ts
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

comment on function public.upcoming_runs is
  'Weekly series expanded into occurrences within a bounded window, DST-correct, with cancellations and reschedules applied.';

grant execute on function public.upcoming_runs(bigint, bigint[], uuid, timestamptz, integer)
  to anon, authenticated;

create or replace function public.join_run_session(
  p_run_series_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run record;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Serialize joining with occurrence edits/cancellation before reading availability.
  perform 1 from public.run_series where id = p_run_series_id for update;
  select * into v_run from public.run_sessions
    where run_series_id = p_run_series_id and occurrence_date = p_occurrence_date;
  if found then
    if v_run.cancelled_at is not null or v_run.ends_at <= now()
      or not exists (select 1 from public.run_series where id = p_run_series_id and status = 'active')
      or (v_run.venue_id is not null and not exists (select 1 from public.venues where id = v_run.venue_id and status = 'active'))
      or exists (select 1 from public.run_exceptions where run_series_id = p_run_series_id
        and occurrence_date = p_occurrence_date and status = 'cancelled') then
      raise exception 'Session is no longer available' using errcode = '22023';
    end if;
    v_session_id := v_run.id;
    insert into public.session_memberships (session_id, user_id, role)
      select v_session_id, v_user_id,
        (case when organizer_id = v_user_id then 'organizer' else 'player' end)::public.session_member_role
      from public.run_series where id = p_run_series_id
      on conflict (session_id, user_id) do nothing;
    return v_session_id;
  end if;

  select u.* into v_run
    from public.upcoming_runs(
      null, null, null,
      (p_occurrence_date::timestamp at time zone 'UTC') - interval '1 day',
      3
    ) u
   where u.run_series_id = p_run_series_id
     and u.occurrence_date = p_occurrence_date
   limit 1;

  if not found or v_run.ends_at <= now() then
    raise exception 'run occurrence is unavailable' using errcode = '22023';
  end if;

  insert into public.run_sessions (
    run_series_id, occurrence_date, starts_at, ends_at,
    venue_id, sport_id, region_id, location_name, latitude, longitude
  )
  select v_run.run_series_id, v_run.occurrence_date, v_run.starts_at,
         v_run.ends_at, v_run.venue_id, v_run.sport_id, s.region_id, s.location_name, s.latitude, s.longitude
    from public.run_series s
   where s.id = v_run.run_series_id
  on conflict (run_series_id, occurrence_date) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id into v_session_id;

  insert into public.session_memberships (session_id, user_id, role)
  values (v_session_id, v_run.organizer_id, 'organizer')
  on conflict (session_id, user_id) do update set role = 'organizer';

  insert into public.session_memberships (session_id, user_id, role)
  values (
    v_session_id,
    v_user_id,
    (case when v_user_id = v_run.organizer_id then 'organizer'
          else 'player' end)::public.session_member_role
  )
  on conflict (session_id, user_id) do nothing;

  return v_session_id;
end
$$;

revoke all on function public.join_run_session(uuid, date) from public;

grant execute on function public.join_run_session(uuid, date) to authenticated;

create function public.edit_run_session(
  p_session_id uuid, p_title text, p_date date, p_start_time time, p_end_time time,
  p_timezone text, p_location_name text default null,
  p_lat double precision default null, p_lon double precision default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.run_sessions;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() for update of s;
  if not found then raise exception 'Only the organizer can edit this session' using errcode = '42501'; end if;
  select * into v_session from public.run_sessions where id = p_session_id for update;
  if v_session.cancelled_at is not null or v_session.starts_at <= now() then
    raise exception 'Only upcoming active sessions can be edited' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid time zone' using errcode = '22023';
  end if;
  v_start := (p_date + p_start_time) at time zone p_timezone;
  v_end := (p_date + p_end_time) at time zone p_timezone;
  if v_start is null or v_end is null or v_start <= now() or v_start > now() + interval '84 days'
    or v_end <= v_start or p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    raise exception 'Choose a title of 2–80 characters and future times within 84 days, with end after start' using errcode = '22023';
  end if;
  if v_session.venue_id is null and (p_lat is null or p_lon is null or p_lat not between -90 and 90
    or p_lon not between -180 and 180 or p_location_name is null or char_length(btrim(p_location_name)) not between 2 and 120) then
    raise exception 'Choose a valid pin and meeting spot name' using errcode = '22023';
  end if;
  update public.run_sessions set title = btrim(p_title), starts_at = v_start, ends_at = v_end,
    location_name = case when venue_id is null then btrim(p_location_name) end,
    region_id = case when venue_id is not null then region_id else (
      select id from public.regions where is_published and p_lat between min_lat and max_lat
        and p_lon between min_lon and max_lon order by (max_lat-min_lat)*(max_lon-min_lon) limit 1
    ) end,
    latitude = case when venue_id is null then p_lat end,
    longitude = case when venue_id is null then p_lon end
    where id = p_session_id;
  insert into public.run_exceptions (run_series_id, occurrence_date, status, replacement_start_at, replacement_end_at)
    values (v_session.run_series_id, v_session.occurrence_date, 'rescheduled', v_start, v_end)
    on conflict (run_series_id, occurrence_date) do update set status = 'rescheduled',
      replacement_start_at = excluded.replacement_start_at, replacement_end_at = excluded.replacement_end_at;
end;
$$;

create function public.cancel_run_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.run_sessions;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() for update of s;
  if not found then raise exception 'Only the organizer can cancel this session' using errcode = '42501'; end if;
  select * into v_session from public.run_sessions where id = p_session_id for update;
  if v_session.cancelled_at is not null then return; end if;
  if v_session.ends_at <= now() then raise exception 'This session has already ended' using errcode = '22023'; end if;
  update public.run_sessions set cancelled_at = now() where id = p_session_id;
  insert into public.run_exceptions (run_series_id, occurrence_date, status)
    values (v_session.run_series_id, v_session.occurrence_date, 'cancelled')
    on conflict (run_series_id, occurrence_date) do update set status = 'cancelled',
      replacement_start_at = null, replacement_end_at = null;
end;
$$;

create function public.leave_run_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id for update of s;
  if exists (select 1 from public.run_series s join public.run_sessions r on r.run_series_id = s.id
    where r.id = p_session_id and s.organizer_id = auth.uid() and r.cancelled_at is null and r.ends_at > now()) then
    raise exception 'As organizer, cancel the session instead of leaving it without a host' using errcode = '22023';
  end if;
  delete from public.session_memberships where session_id = p_session_id and user_id = auth.uid();
end;
$$;

-- Cancelled sessions retain readable history for members, but accept no new content.
create function public.can_post_to_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_session_member(p_session_id) and exists (
    select 1 from public.run_sessions where id = p_session_id and cancelled_at is null
  )
$$;

revoke all on function public.can_post_to_session(uuid) from public, anon;

grant execute on function public.can_post_to_session(uuid) to authenticated;

alter policy session_messages_insert_member on public.session_messages
  with check (user_id = (select auth.uid()) and public.can_post_to_session(session_id));

alter policy session_posts_insert_member on public.session_posts
  with check (author_id = (select auth.uid()) and public.can_post_to_session(session_id));

alter policy session_media_insert_member on public.session_media
  with check (uploader_id = (select auth.uid()) and exists (
    select 1 from public.session_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and public.can_post_to_session(p.session_id)
  ));

revoke all on function public.edit_run_session(uuid, text, date, time, time, text, text, double precision, double precision),
  public.cancel_run_session(uuid), public.leave_run_session(uuid) from public, anon;

grant execute on function public.edit_run_session(uuid, text, date, time, time, text, text, double precision, double precision),
  public.cancel_run_session(uuid), public.leave_run_session(uuid) to authenticated;

alter policy session_media_objects_insert_own_folder on storage.objects
  with check (
    bucket_id = 'session-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2] and p.author_id = (select auth.uid())
        and public.can_post_to_session(p.session_id))
  );

-- Source: 20260906110000_admin_review.sql
-- Privileged changes are transactional RPCs. Browser clients cannot bypass them.
revoke insert, update, delete on public.venues, public.venue_sports, public.venue_aliases from authenticated;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;

grant select on public.admin_audit_log to authenticated;

create policy admin_audit_read on public.admin_audit_log for select to authenticated using (public.is_admin());

-- SECURITY DEFINER: candidate/venue writes are unavailable through the Data API.
create function public.admin_review_candidate(
  p_candidate_id uuid, p_decision text, p_note text default null,
  p_target_venue_id uuid default null, p_name text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.venue_candidates; v_id uuid; v_name text;
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
  if p_decision = 'approve' then
    v_name := coalesce(nullif(btrim(p_name), ''), c.proposed_name);
    if not exists (select 1 from public.venue_candidate_sports where candidate_id = c.id) then
      raise exception 'Submission needs at least one sport' using errcode = '22023';
    end if;
    insert into public.venues(region_id, name, location, address_text, indoor_state, created_by)
    values(c.region_id, v_name, c.location, c.address_text, c.indoor_state, auth.uid()) returning id into v_id;
    insert into public.venue_sports(venue_id, sport_id)
    select v_id, sport_id from public.venue_candidate_sports where candidate_id = c.id;
  elsif p_decision = 'merge' then
    select id into v_id from public.venues where id = p_target_venue_id and status = 'active'
      and region_id = c.region_id for update;
    if v_id is null then raise exception 'Choose an active venue in the same region' using errcode = '22023'; end if;
    insert into public.venue_aliases(venue_id, alias, source) values(v_id, c.proposed_name, 'review') on conflict do nothing;
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

revoke all on function public.admin_review_candidate(uuid,text,text,uuid,text) from public, anon;

grant execute on function public.admin_review_candidate(uuid,text,text,uuid,text) to authenticated;

create function public.admin_update_venue(
  p_venue_id uuid, p_name text, p_address text, p_indoor_state public.indoor_state,
  p_status public.venue_status, p_verified boolean, p_sport_ids bigint[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.venues;
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
  update public.venues set name = btrim(p_name), address_text = nullif(btrim(p_address), ''),
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

revoke all on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[]) from public, anon;

grant execute on function public.admin_update_venue(uuid,text,text,public.indoor_state,public.venue_status,boolean,bigint[]) to authenticated;

-- Source: 20260906120000_session_photo_proximity.sql
-- Only a proximity-checked RPC can create new feed posts. Device coordinates
-- are checked transiently, never saved alongside public posts.
alter table public.session_posts add column location_verified_at timestamptz;
revoke insert on public.session_posts from authenticated;

create function public.check_session_photo_location(
  p_session_id uuid, p_lat double precision, p_lon double precision,
  p_accuracy double precision, p_observed_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare v_location extensions.geography;
begin
  if auth.uid() is null or not public.can_post_to_session(p_session_id) then
    raise exception 'Join an active session before sharing a photo.';
  end if;
  if p_lat is null or not (p_lat between -90 and 90)
    or p_lon is null or not (p_lon between -180 and 180)
    or p_accuracy is null or not (p_accuracy between 0 and 100) then
    raise exception 'Location is not accurate enough. Enable precise location and try again.';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '2 minutes'
    or p_observed_at > now() + interval '30 seconds' then
    raise exception 'Your location reading expired. Check your location again.';
  end if;
  select coalesce(v.location,
    extensions.st_setsrid(extensions.st_makepoint(s.longitude, s.latitude), 4326)::extensions.geography)
    into v_location from public.run_sessions s
    left join public.venues v on v.id = s.venue_id where s.id = p_session_id;
  if v_location is null then
    raise exception 'This session needs a meeting location before photos can be shared.';
  end if;
  if not extensions.st_dwithin(v_location,
    extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography, 500) then
    raise exception 'You need to be within 500 metres of the session location to share a photo.';
  end if;
end;
$$;

create function public.create_session_photo_post(
  p_session_id uuid, p_caption text, p_lat double precision, p_lon double precision,
  p_accuracy double precision, p_observed_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- Serialize against session edits/cancellation while checking its meeting point.
  perform 1 from public.run_sessions where id = p_session_id for share;
  perform public.check_session_photo_location(p_session_id, p_lat, p_lon, p_accuracy, p_observed_at);
  insert into public.session_posts(session_id, author_id, caption, location_verified_at)
    values (p_session_id, auth.uid(), nullif(btrim(p_caption), ''), now()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.check_session_photo_location(uuid, double precision, double precision, double precision, timestamptz),
  public.create_session_photo_post(uuid, text, double precision, double precision, double precision, timestamptz) from public, anon;
grant execute on function public.check_session_photo_location(uuid, double precision, double precision, double precision, timestamptz),
  public.create_session_photo_post(uuid, text, double precision, double precision, double precision, timestamptz) to authenticated;

alter policy session_media_insert_member on public.session_media
  with check (uploader_id = (select auth.uid()) and exists (
    select 1 from public.session_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and public.can_post_to_session(p.session_id)
      and p.location_verified_at > now() - interval '15 minutes'
  ));
alter policy session_media_objects_insert_own_folder on storage.objects
  with check (
    bucket_id = 'session-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.session_posts p
      where p.id::text = (storage.foldername(name))[2] and p.author_id = (select auth.uid())
        and public.can_post_to_session(p.session_id)
        and p.location_verified_at > now() - interval '15 minutes')
  );
;

-- Source: 20260908010000_session_attendance.sql
-- Attendance is per dated occurrence. A repeated Going response counts once.
alter table public.session_memberships
  add column attendance text not null default 'going'
  check (attendance in ('going', 'maybe'));

create function public.set_run_attendance(
  p_run_series_id uuid, p_occurrence_date date, p_attendance text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attendance is null or p_attendance not in ('going', 'maybe') then
    raise exception 'invalid attendance' using errcode = '22023';
  end if;
  v_session_id := public.join_run_session(p_run_series_id, p_occurrence_date);
  update public.session_memberships set attendance = p_attendance
    where session_id = v_session_id and user_id = auth.uid();
  return v_session_id;
end
$$;
revoke all on function public.set_run_attendance(uuid, date, text) from public, anon, authenticated;
grant execute on function public.set_run_attendance(uuid, date, text) to authenticated;

-- Expose totals and only the caller's response, never other players' identities.
create function public.run_attendance(p_series_ids uuid[])
returns table (
  session_id uuid, run_series_id uuid, occurrence_date date,
  going_count bigint, maybe_count bigint, my_response text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.run_series_id, s.occurrence_date,
    count(*) filter (where m.attendance = 'going'),
    count(*) filter (where m.attendance = 'maybe'),
    max(m.attendance) filter (where m.user_id = auth.uid())
  from public.run_sessions s
  left join public.session_memberships m on m.session_id = s.id
  where s.run_series_id = any(p_series_ids)
  group by s.id
$$;
revoke all on function public.run_attendance(uuid[]) from public, anon, authenticated;
grant execute on function public.run_attendance(uuid[]) to anon, authenticated;
