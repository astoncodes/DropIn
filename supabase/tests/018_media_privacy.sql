begin;
select plan(4);
select is((select public from storage.buckets where id = 'session-media'), false,
  'media bucket is private');
select ok(not has_table_privilege('anon', 'public.session_posts', 'SELECT'),
  'anonymous users cannot read post metadata');
select ok(not has_table_privilege('anon', 'public.session_media', 'SELECT'),
  'anonymous users cannot read media metadata');
set local role anon;
select throws_ok($$ select * from public.session_media $$, '42501', null,
  'direct anonymous media requests are denied');
reset role;
select * from finish();
rollback;
