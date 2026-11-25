-- The rules of the long-term goals (ADR-0027): valid values, a single live total per goal, and
-- each user only with their own rows.
begin;
select plan(11);

-- Two users: Ana (aaaa…) and Bea (bbbb…), each with a goal and its total.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bea@example.com');

insert into public.long_term_goals (id, user_id, name, type, target, unit, increment, first_day, deadline) values
  ('aaaaaaaa-0000-4000-8000-000000000051', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Read', 'quantitative', 24, 'books', 1, '2026-11-25', '2026-12-31'),
  ('bbbbbbbb-0000-4000-8000-000000000051', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Run', 'boolean', null, null, null, '2026-11-25', '2027-03-01');
insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value) values
  ('aaaaaaaa-0000-4000-8000-000000000052', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000051', 3),
  ('bbbbbbbb-0000-4000-8000-000000000052', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000051', 1);

-- The deadline is after the first day, and a total is not negative.
select throws_ok(
  $$ insert into public.long_term_goals (id, user_id, name, type, first_day, deadline)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'boolean', '2026-11-25', '2026-11-25') $$,
  '23514', null,
  'The deadline of a goal is after its first day'
);
select throws_ok(
  $$ insert into public.long_term_goals (id, user_id, name, type, first_day, deadline)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'monthly', '2026-11-25', '2026-12-31') $$,
  '23514', null,
  'A goal is boolean or quantitative'
);
select throws_ok(
  $$ insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000051', -1) $$,
  '23514', null,
  'A total cannot be negative'
);

-- A single live total per goal; a deleted one does not count.
select throws_ok(
  $$ insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000051', 2) $$,
  '23505', null,
  'A goal has a single live total'
);
update public.long_term_goal_entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000052';
select lives_ok(
  $$ insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value)
     values ('aaaaaaaa-0000-4000-8000-000000000053', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000051', 2) $$,
  'A deleted total can be created again'
);

-- Signed in as Ana.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select results_eq(
  'select id from public.long_term_goals',
  array['aaaaaaaa-0000-4000-8000-000000000051'::uuid],
  'Ana only reads her goals'
);
select results_eq(
  'select id from public.long_term_goal_entries where not deleted',
  array['aaaaaaaa-0000-4000-8000-000000000053'::uuid],
  'Ana only reads her totals'
);
select throws_ok(
  $$ insert into public.long_term_goal_entries (id, long_term_goal_id, value)
     values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000051', 1) $$,
  '23503', null,
  'Ana cannot hang a total from a goal of Bea'
);
select is_empty(
  $$ update public.long_term_goals set name = 'Hacked'
     where id = 'bbbbbbbb-0000-4000-8000-000000000051' returning id $$,
  'Ana cannot change a goal of Bea'
);
select is_empty(
  $$ update public.long_term_goal_entries set value = 99
     where id = 'bbbbbbbb-0000-4000-8000-000000000052' returning id $$,
  'Ana cannot change a total of Bea'
);
reset role;

-- Deleting the account deletes its rows, and only its rows (RF-04).
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*)::int from public.long_term_goals)
    + (select count(*)::int from public.long_term_goal_entries),
  2,
  'Deleting the account of Ana leaves only the two rows of Bea'
);

select * from finish();
rollback;
