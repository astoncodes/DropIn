-- Sign in with Apple refresh tokens, kept so that deleting an account can
-- revoke the player's Apple authorization as App Review requires. Only the
-- Edge Functions, as service_role, read or write them; no client role can see
-- a row. Deleting the Auth user removes the row.
create table public.apple_refresh_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.apple_refresh_tokens enable row level security;
revoke all on public.apple_refresh_tokens from public, anon, authenticated;
grant all on public.apple_refresh_tokens to service_role;
