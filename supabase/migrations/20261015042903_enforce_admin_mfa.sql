-- Deploy only after the MFA-capable admin UI and a tested recovery procedure.
-- Every existing admin policy/RPC calls this helper, so AAL1 tokens cannot
-- bypass the challenge by calling PostgREST directly.
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_user_id = auth.uid()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;
comment on function public.is_admin(uuid) is
  'True only for the caller with server-assigned admin membership and an AAL2 session.';
