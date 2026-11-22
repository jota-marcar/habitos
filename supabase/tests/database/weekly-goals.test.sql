-- The rules of the weekly goals (ADR-0022): valid values, one live row per natural key, and
-- each user only with their own rows.
begin;
select plan(15);

-- Two users: Ana (aaaa…) and Bea (bbbb…), each with a goal and its rows.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bea@example.com');

insert into public.weekly_goals (id, user_id, name, type, recurring, first_week) values
  ('aaaaaaaa-0000-4000-8000-000000000021', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Run', 'boolean', true, '2026-11-16'),
  ('bbbbbbbb-0000-4000-8000-000000000021', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Read', 'boolean', true, '2026-11-16');
insert into public.weekly_goal_versions (id, user_id, weekly_goal_id, effective_from) values
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-16'),
  ('bbbbbbbb-0000-4000-8000-000000000022', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000021', '2026-11-16');
insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value) values
  ('aaaaaaaa-0000-4000-8000-000000000023', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-16', 1),
  ('bbbbbbbb-0000-4000-8000-000000000023', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000021', '2026-11-16', 1);

-- Weeks are Mondays.
select throws_ok(
  $$ insert into public.weekly_goals (id, user_id, name, type, recurring, first_week)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'boolean', true, '2026-11-17') $$,
  '23514', null,
  'The first week of a goal is a Monday'
);
select throws_ok(
  $$ insert into public.weekly_goals (id, user_id, name, type, recurring, first_week, archived_week)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'boolean', true, '2026-11-16', '2026-11-17') $$,
  '23514', null,
  'The archived week of a goal is a Monday'
);
select throws_ok(
  $$ insert into public.weekly_goals (id, user_id, name, type, recurring, first_week, archived_week)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'boolean', false, '2026-11-16', '2026-11-16') $$,
  '23514', null,
  'A one-off goal cannot be archived'
);
select throws_ok(
  $$ insert into public.weekly_goal_versions (id, user_id, weekly_goal_id, effective_from)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-24') $$,
  '23514', null,
  'A version takes effect on a Monday'
);
select throws_ok(
  $$ insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-24', 1) $$,
  '23514', null,
  'A total belongs to a week, identified by its Monday'
);
select throws_ok(
  $$ insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-23', -1) $$,
  '23514', null,
  'A total cannot be negative'
);

-- One live row per natural key; a deleted one does not count.
select throws_ok(
  $$ insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-16', 2) $$,
  '23505', null,
  'A goal has a single live total per week'
);
update public.weekly_goal_entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000023';
select lives_ok(
  $$ insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value)
     values ('aaaaaaaa-0000-4000-8000-000000000024', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-16', 2) $$,
  'A deleted total can be created again'
);
select throws_ok(
  $$ insert into public.weekly_goal_versions (id, user_id, weekly_goal_id, effective_from)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000021', '2026-11-16') $$,
  '23505', null,
  'A goal has a single live version per start week'
);

-- Signed in as Ana.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select results_eq(
  'select id from public.weekly_goals',
  array['aaaaaaaa-0000-4000-8000-000000000021'::uuid],
  'Ana only reads her goals'
);
select results_eq(
  'select id from public.weekly_goal_versions',
  array['aaaaaaaa-0000-4000-8000-000000000022'::uuid],
  'Ana only reads her goal versions'
);
select results_eq(
  'select id from public.weekly_goal_entries where not deleted',
  array['aaaaaaaa-0000-4000-8000-000000000024'::uuid],
  'Ana only reads her totals'
);
select throws_ok(
  $$ insert into public.weekly_goal_entries (id, weekly_goal_id, week, value)
     values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000021', '2026-11-23', 1) $$,
  '23503', null,
  'Ana cannot hang a total from a goal of Bea'
);
select is_empty(
  $$ update public.weekly_goals set name = 'Hacked'
     where id = 'bbbbbbbb-0000-4000-8000-000000000021' returning id $$,
  'Ana cannot change a goal of Bea'
);
reset role;

-- Deleting the account deletes its rows, and only its rows (RF-04).
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*)::int from public.weekly_goals)
    + (select count(*)::int from public.weekly_goal_versions)
    + (select count(*)::int from public.weekly_goal_entries),
  3,
  'Deleting the account of Ana leaves only the three rows of Bea'
);

select * from finish();
rollback;
