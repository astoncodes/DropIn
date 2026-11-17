begin;
select plan(8);
insert into auth.users(instance_id,id,aud,role,email) values
('00000000-0000-0000-0000-000000000000','96666666-6666-4666-8666-666666666661','authenticated','authenticated','apple-owner@example.test'),
('00000000-0000-0000-0000-000000000000','96666666-6666-4666-8666-666666666662','authenticated','authenticated','apple-peer@example.test');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select lives_ok($$insert into public.apple_refresh_tokens(user_id,refresh_token) values ('96666666-6666-4666-8666-666666666661','refresh-one')$$,'Server stores a refresh token');
select lives_ok($$insert into public.apple_refresh_tokens(user_id,refresh_token) values ('96666666-6666-4666-8666-666666666661','refresh-two') on conflict (user_id) do update set refresh_token=excluded.refresh_token, updated_at=now()$$,'Server replaces the token on a new sign-in');
select is((select refresh_token from public.apple_refresh_tokens where user_id='96666666-6666-4666-8666-666666666661'),'refresh-two','One row per account holds the latest token');
reset role;

select set_config('request.jwt.claims','{"sub":"96666666-6666-4666-8666-666666666661","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select refresh_token from public.apple_refresh_tokens$$,'42501',null,'A player cannot read their own Apple token');
select throws_ok($$insert into public.apple_refresh_tokens(user_id,refresh_token) values (auth.uid(),'forged')$$,'42501',null,'A player cannot store a token');
select throws_ok($$delete from public.apple_refresh_tokens$$,'42501',null,'A player cannot remove a token');
reset role;

set local role anon;
select throws_ok($$select refresh_token from public.apple_refresh_tokens$$,'42501',null,'Anonymous cannot read Apple tokens');
reset role;

delete from auth.users where id='96666666-6666-4666-8666-666666666661';
select is((select count(*)::integer from public.apple_refresh_tokens where user_id='96666666-6666-4666-8666-666666666661'),0,'Deleting the Auth user removes its token');

select * from finish();
rollback;
