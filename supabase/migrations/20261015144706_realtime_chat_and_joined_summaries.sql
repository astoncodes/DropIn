-- Stream inserts through Supabase Realtime. Existing member-only SELECT RLS on
-- session_messages is also enforced for Postgres Changes subscribers. Clients
-- treat the event as an invalidation signal and refetch authoritative rows.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_messages'
  ) then
    alter publication supabase_realtime add table public.session_messages;
  end if;
end;
$$;

-- Return no more than one latest message for each session the caller joined.
-- This replaces downloading every message for every joined session merely to
-- render the Chats list preview.
create or replace function public.latest_joined_session_messages()
returns table (
  id uuid,
  session_id uuid,
  user_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (message.session_id)
    message.id,
    message.session_id,
    message.user_id,
    message.body,
    message.created_at
  from public.session_messages message
  join public.session_memberships membership
    on membership.session_id = message.session_id
   and membership.user_id = (select auth.uid())
  order by message.session_id, message.created_at desc, message.id desc;
$$;

revoke all on function public.latest_joined_session_messages() from public, anon;
grant execute on function public.latest_joined_session_messages() to authenticated;

-- Apply the row limit only after nearby sessions have been prioritized. Doing
-- this in the client after fetching a global top 50 could hide local activity
-- whenever a distant launch area is busier.
create or replace function public.community_feed_posts(
  p_lat double precision default null,
  p_lon double precision default null,
  p_limit integer default 50
)
returns setof public.session_posts
language sql
stable
security invoker
set search_path = ''
as $$
  select post.*
  from public.session_posts post
  join public.run_sessions session on session.id = post.session_id
  order by
    case
      when p_lat is not null and p_lon is not null
       and session.latitude is not null and session.longitude is not null
       and extensions.st_distance(
         extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography,
         extensions.st_setsrid(
           extensions.st_makepoint(session.longitude, session.latitude),
           4326
         )::extensions.geography
       ) <= 50000
      then 0
      else 1
    end,
    post.created_at desc,
    post.id desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.community_feed_posts(double precision, double precision, integer)
  from public, anon;
grant execute on function public.community_feed_posts(double precision, double precision, integer)
  to authenticated;
