begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777771', 'authenticated', 'authenticated', 'limit-one@example.test'),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777772', 'authenticated', 'authenticated', 'limit-two@example.test');

select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anonymous cannot access counters');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'users cannot access counters');
select ok(not has_function_privilege('authenticated', 'private.consume_write_limit(text,integer,integer)', 'EXECUTE'),
  'clients cannot select their own quota limits');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777771","role":"authenticated"}', true);
select lives_ok($$ select private.consume_write_limit('test', 60, 2) $$, 'first write succeeds');
select lives_ok($$ select private.consume_write_limit('test', 60, 2) $$, 'write at limit succeeds');
select throws_ok($$ select private.consume_write_limit('test', 60, 2) $$,
  'PT429', 'Too many requests. Please try again later.', 'next write is rate limited');
select is((select used from private.write_rate_limits where action = 'test'), 2,
  'rejection does not increment the counter');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777772","role":"authenticated"}', true);
select lives_ok($$ select private.consume_write_limit('test', 60, 2) $$, 'another user has an independent quota');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777771","role":"authenticated"}', true);
update private.write_rate_limits set window_start = window_start - interval '1 minute'
  where user_id = '77777777-7777-4777-8777-777777777771';
select lives_ok($$ select private.consume_write_limit('test', 60, 2) $$, 'new window resets quota');
select is((select used from private.write_rate_limits where user_id = '77777777-7777-4777-8777-777777777771'), 1,
  'new window starts at one');

select * from finish();
rollback;
