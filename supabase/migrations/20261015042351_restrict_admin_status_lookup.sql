-- Retain the signature used by policies and generated clients, but never expose
-- another user's admin membership through the public RPC. Anonymous policies
-- must still be able to call this helper and receive false.
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and p_user_id = auth.uid()
    and exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

comment on function public.is_admin(uuid) is
  'Checks only the authenticated caller. Explicit IDs cannot inspect another user. Anonymous callers always receive false.';
