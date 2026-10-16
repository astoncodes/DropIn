-- Private counters are not a client API. A fixed number of rows per user/action
-- bounds storage; atomic UPSERT serializes concurrent requests for the same key.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.write_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_seconds integer not null check (window_seconds > 0),
  window_start timestamptz not null,
  used integer not null check (used > 0),
  primary key (user_id, action, window_seconds)
);
alter table private.write_rate_limits enable row level security;
revoke all on private.write_rate_limits from public, anon, authenticated;

create function private.consume_write_limit(p_action text, p_seconds integer, p_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_start timestamptz;
  v_used integer;
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  v_start := pg_catalog.date_bin(pg_catalog.make_interval(secs => p_seconds),
    pg_catalog.statement_timestamp(), '1970-01-01'::timestamptz);
  insert into private.write_rate_limits as r (user_id, action, window_seconds, window_start, used)
    values (v_user, p_action, p_seconds, v_start, 1)
    on conflict (user_id, action, window_seconds) do update
      set window_start = excluded.window_start,
          used = case when r.window_start = excluded.window_start then r.used + 1 else 1 end
      where r.window_start <> excluded.window_start or r.used < p_limit
    returning used into v_used;
  if v_used is null then
    -- Server log survives transaction rollback. No message text, tokens, or PII.
    raise log 'dropin_security rate_limit action=% window_seconds=%', p_action, p_seconds;
    raise exception 'Too many requests. Please try again later.' using errcode = 'PT429';
  end if;
end;
$$;
revoke all on function private.consume_write_limit(text, integer, integer) from public, anon, authenticated;

create function private.limit_user_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Trusted maintenance without a user JWT does not spend a player's quota.
  -- Client inserts still require the existing RLS/RPC authentication checks.
  if auth.uid() is not null then
    perform private.consume_write_limit(TG_ARGV[0], 60, TG_ARGV[1]::integer);
    perform private.consume_write_limit(TG_ARGV[0], 86400, TG_ARGV[2]::integer);
  end if;
  return new;
end;
$$;
revoke all on function private.limit_user_writes() from public, anon, authenticated;

-- Row triggers cover both direct REST inserts and SECURITY DEFINER RPC writes.
-- Failed transactions do not spend quota. Deleting content does not reset it.
create trigger rate_limit_messages before insert on public.session_messages
  for each row execute function private.limit_user_writes('message', '20', '500');
create trigger rate_limit_runs before insert on public.run_series
  for each row execute function private.limit_user_writes('run', '3', '20');
create trigger rate_limit_venues before insert on public.venue_candidates
  for each row execute function private.limit_user_writes('venue_submission', '3', '10');
create trigger rate_limit_posts before insert on public.session_posts
  for each row execute function private.limit_user_writes('post', '5', '50');
create trigger rate_limit_check_ins before insert on public.check_ins
  for each row execute function private.limit_user_writes('check_in', '5', '50');
