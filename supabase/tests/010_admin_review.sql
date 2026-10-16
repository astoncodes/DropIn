begin;
select plan(15);
insert into auth.users(instance_id,id,aud,role,email) values
('00000000-0000-0000-0000-000000000000','81111111-1111-4111-8111-111111111111','authenticated','authenticated','admin-review-player@example.test'),
('00000000-0000-0000-0000-000000000000','82222222-2222-4222-8222-222222222222','authenticated','authenticated','admin-review-admin@example.test');
insert into public.admin_users(user_id) values('82222222-2222-4222-8222-222222222222');
insert into public.venue_candidates(id,region_id,submitted_by,proposed_name,location,indoor_state)
select id, (select id from public.regions where slug='charlottetown'), '81111111-1111-4111-8111-111111111111', name,
extensions.ST_SetSRID(extensions.ST_MakePoint(-63.12,46.24),4326)::extensions.geography,'outdoor'
from (values ('83333333-3333-4333-8333-333333333333'::uuid,'Review court'),('84444444-4444-4444-8444-444444444444'::uuid,'Duplicate court'),('85555555-5555-4555-8555-555555555555'::uuid,'Reject court')) t(id,name);
insert into public.venue_candidate_sports(candidate_id,sport_id) select id,(select id from public.sports where slug='basketball') from public.venue_candidates where submitted_by='81111111-1111-4111-8111-111111111111';
set local role anon;
select throws_ok($$select public.admin_review_candidate('83333333-3333-4333-8333-333333333333','approve')$$,'42501',null,'anonymous review denied');
reset role;
select set_config('request.jwt.claims','{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.admin_review_candidate('83333333-3333-4333-8333-333333333333','approve')$$,'42501','Admin access required','player review denied');
select is((select count(*)::int from public.admin_audit_log),0,'player cannot read audit');
reset role;
select set_config('request.jwt.claims','{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok($$update public.venues set name='Bypass'$$,'42501',null,'even admins must use RPCs');
select lives_ok($$select public.admin_review_candidate('83333333-3333-4333-8333-333333333333','approve','Looks good',null,'Reviewed court')$$,'admin can approve');
select is((select status::text from public.venue_candidates where id='83333333-3333-4333-8333-333333333333'),'approved','candidate approved');
select is((select count(*)::int from public.venue_sports where venue_id=(select published_venue_id from public.venue_candidates where id='83333333-3333-4333-8333-333333333333')),1,'sports published atomically');
select throws_ok($$select public.admin_review_candidate('83333333-3333-4333-8333-333333333333','approve')$$,'22023','This submission has already been reviewed','repeat review refused');
select throws_ok($$select public.admin_review_candidate('85555555-5555-4555-8555-555555555555','reject',' ')$$,'22023','A rejection reason is required','rejection needs reason');
select lives_ok($$select public.admin_review_candidate('85555555-5555-4555-8555-555555555555','reject','Not a sports venue')$$,'reject with reason');
select throws_ok($$select public.admin_review_candidate('84444444-4444-4444-8444-444444444444','merge',null,'89999999-9999-4999-8999-999999999999')$$,'22023','Choose an active venue in the same region','invalid target refused');
select lives_ok($$select public.admin_review_candidate('84444444-4444-4444-8444-444444444444','merge','Same court',(select published_venue_id from public.venue_candidates where id='83333333-3333-4333-8333-333333333333'))$$,'link duplicate to existing venue');
select is((select count(*)::int from public.venue_aliases where alias='Duplicate court'),1,'duplicate name preserved');
select lives_ok($$select public.admin_update_venue((select published_venue_id from public.venue_candidates where id='83333333-3333-4333-8333-333333333333'),'Updated court','Test address','outdoor','removed',true,array[(select id from public.sports where slug='basketball')])$$,'admin can edit and remove venue');
select is((select count(*)::int from public.admin_audit_log),4,'only successful mutations are audited');
select * from finish();
rollback;
