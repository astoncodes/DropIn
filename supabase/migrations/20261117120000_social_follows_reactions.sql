-- Players follow each other, react to moments, and see the people they follow
-- playing right now. Following is one-directional and public to both sides;
-- a block in either direction prevents a follow and hides the profile.

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followed_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_not_self check (follower_id <> followed_id)
);
create index follows_followed_idx on public.follows (followed_id);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;

-- True when either player has blocked the other. Invoker rights: user_blocks
-- shows a caller only their own blocks, so the other direction is read by a
-- definer function below.
create function public.blocked_either_way(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_user_id)
        or (b.blocker_id = p_user_id and b.blocked_id = (select auth.uid()))
  )
$$;
revoke all on function public.blocked_either_way(uuid) from public, anon;
grant execute on function public.blocked_either_way(uuid) to authenticated;

create policy follows_select_either_side on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followed_id = (select auth.uid()));
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and not public.blocked_either_way(followed_id));
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));
grant select, delete on public.follows to authenticated;
grant insert (follower_id, followed_id) on public.follows to authenticated;
create trigger rate_limit_follows before insert on public.follows
  for each row execute function private.limit_user_writes('follow', '30', '300');
create trigger guard_account_deletion before insert or update on public.follows
  for each statement execute function public.guard_account_deletion();

-- Blocking someone ends the follow in both directions.
create function public.end_follows_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and followed_id = new.blocked_id)
      or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  return new;
end;
$$;
revoke all on function public.end_follows_on_block() from public, anon, authenticated;
create trigger end_follows_on_block after insert on public.user_blocks
  for each row execute function public.end_follows_on_block();

-- ---------------------------------------------------------------------------
-- Reactions to moments
-- ---------------------------------------------------------------------------
create table public.post_reactions (
  post_id    uuid not null references public.session_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from anon, authenticated;
-- A reaction is visible to whoever can see the post; session_posts' own
-- policies decide that inside the subquery.
create policy post_reactions_select_visible_post on public.post_reactions
  for select to authenticated
  using (exists (select 1 from public.session_posts p where p.id = post_id));
create policy post_reactions_insert_own on public.post_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.session_posts p where p.id = post_id));
create policy post_reactions_delete_own on public.post_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.post_reactions to authenticated;
grant insert (post_id, user_id) on public.post_reactions to authenticated;
create trigger rate_limit_reactions before insert on public.post_reactions
  for each row execute function private.limit_user_writes('reaction', '60', '600');
create trigger guard_account_deletion before insert or update on public.post_reactions
  for each statement execute function public.guard_account_deletion();

-- How many reacted to each post, and whether the caller did.
create function public.post_reaction_counts(p_post_ids uuid[])
returns table (post_id uuid, reactions integer, reacted boolean)
language sql stable set search_path = '' as $$
  select r.post_id,
         count(*)::integer,
         bool_or(r.user_id = (select auth.uid()))
    from public.post_reactions r
   where r.post_id = any (p_post_ids)
   group by r.post_id
$$;
revoke all on function public.post_reaction_counts(uuid[]) from public, anon;
grant execute on function public.post_reaction_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- A player's public profile
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required: a player's sports and their past check-ins are
-- visible only to themselves by policy, and this is the one place they are
-- summarised for other players, never row by row. A block in either direction
-- returns no row at all.
create function public.player_profile(p_user_id uuid)
returns table (
  id              uuid,
  display_name    text,
  avatar_path     text,
  joined_at       timestamptz,
  sport_slugs     text[],
  sport_names     text[],
  check_in_count  integer,
  session_count   integer,
  venue_count     integer,
  followers       integer,
  following       integer,
  is_following    boolean,
  follows_you     boolean,
  live_venue_id   uuid,
  live_venue_name text,
  live_until      timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id,
         p.display_name,
         p.avatar_path,
         p.created_at,
         coalesce((select array_agg(s.slug order by s.name) from public.profile_sports ps
                     join public.sports s on s.id = ps.sport_id where ps.profile_id = p.id), '{}'),
         coalesce((select array_agg(s.name order by s.name) from public.profile_sports ps
                     join public.sports s on s.id = ps.sport_id where ps.profile_id = p.id), '{}'),
         (select count(*)::integer from public.check_ins c where c.user_id = p.id),
         (select count(*)::integer from public.session_memberships m where m.user_id = p.id),
         (select count(distinct c.venue_id)::integer from public.check_ins c where c.user_id = p.id),
         (select count(*)::integer from public.follows f where f.followed_id = p.id),
         (select count(*)::integer from public.follows f where f.follower_id = p.id),
         exists (select 1 from public.follows f
                  where f.follower_id = (select auth.uid()) and f.followed_id = p.id),
         exists (select 1 from public.follows f
                  where f.follower_id = p.id and f.followed_id = (select auth.uid())),
         live.venue_id,
         live.name,
         live.expires_at
    from public.profiles p
    left join lateral (
      select c.venue_id, v.name, c.expires_at
        from public.check_ins c join public.venues v on v.id = c.venue_id
       where c.user_id = p.id and c.ended_at is null and c.expires_at > now()
       order by c.started_at desc limit 1
    ) live on true
   where p.id = p_user_id
     and (select auth.uid()) is not null
     and not public.blocked_either_way(p.id)
$$;
revoke all on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The people you follow who are playing right now
-- ---------------------------------------------------------------------------
-- Invoker rights: active check-ins, venues and profile names are already
-- readable by every signed-in player; this only joins them to the caller's
-- own follows.
create function public.following_live()
returns table (
  user_id      uuid,
  display_name text,
  avatar_path  text,
  venue_id     uuid,
  venue_name   text,
  sport_slug   text,
  started_at   timestamptz,
  expires_at   timestamptz
)
language sql stable set search_path = '' as $$
  select distinct on (c.user_id)
         c.user_id, p.display_name, p.avatar_path, c.venue_id, v.name, s.slug, c.started_at, c.expires_at
    from public.follows f
    join public.check_ins c on c.user_id = f.followed_id
                            and c.ended_at is null and c.expires_at > now()
    join public.profiles p on p.id = c.user_id
    join public.venues v on v.id = c.venue_id
    join public.sports s on s.id = c.sport_id
   where f.follower_id = (select auth.uid())
   order by c.user_id, c.started_at desc
$$;
revoke all on function public.following_live() from public, anon;
grant execute on function public.following_live() to authenticated;
