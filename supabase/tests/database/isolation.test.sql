-- Each user only reads, creates and changes their own rows, and nobody deletes physically
-- (Row Level Security, supabase/migrations).
begin;
select plan(23);

-- Two users: Ana (aaaa…) and Bea (bbbb…), each with a habit and its rows.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bea@example.com');

insert into public.habits (id, user_id, name, type, created_on) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Read', 'boolean', '2026-11-01'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Run', 'boolean', '2026-11-01');
insert into public.habit_versions (id, user_id, habit_id, effective_from, scheduled_days) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-01', 127),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-11-01', 127);
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', 1),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-11-02', 1);
insert into public.reminders (id, user_id, habit_id, time) values
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '08:00'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', '08:00');
insert into public.tasks (id, user_id, name, type, due_on, due_time) values
  ('aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pay', 'boolean', '2026-11-02', '22:00'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Call', 'boolean', '2026-11-02', '22:00');

-- Signed out: no access at all.
set local role anon;
select throws_ok(
  'select * from public.habits', '42501', null,
  'Without a session, the habits cannot be read'
);
reset role;

-- Signed in as Ana.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

select results_eq(
  'select id from public.habits',
  array['aaaaaaaa-0000-4000-8000-000000000001'::uuid],
  'Ana only reads her habits'
);
select results_eq(
  'select id from public.habit_versions',
  array['aaaaaaaa-0000-4000-8000-000000000002'::uuid],
  'Ana only reads her habit versions'
);
select results_eq(
  'select id from public.entries',
  array['aaaaaaaa-0000-4000-8000-000000000003'::uuid],
  'Ana only reads her entries'
);
select results_eq(
  'select id from public.reminders',
  array['aaaaaaaa-0000-4000-8000-000000000004'::uuid],
  'Ana only reads her reminders'
);
select results_eq(
  'select id from public.tasks',
  array['aaaaaaaa-0000-4000-8000-000000000005'::uuid],
  'Ana only reads her tasks'
);
select throws_ok(
  $$ insert into public.tasks (id, user_id, name, type, due_on, due_time)
     values ('aaaaaaaa-0000-4000-8000-000000000015', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Spy', 'boolean', '2026-11-03', '22:00') $$,
  '42501', null,
  'Ana cannot create a task for Bea'
);
select is_empty(
  $$ update public.tasks set name = 'Hacked' where id = 'bbbbbbbb-0000-4000-8000-000000000005' returning id $$,
  'Ana cannot change a task of Bea'
);
select throws_ok(
  $$ delete from public.tasks where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  '42501', null,
  'Ana cannot delete her tasks physically'
);

select lives_ok(
  $$ insert into public.habits (id, name, type, created_on)
     values ('aaaaaaaa-0000-4000-8000-000000000011', 'Write', 'boolean', '2026-11-03') $$,
  'Ana creates a habit without saying whose it is'
);
select is(
  (select user_id from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000011'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'The new habit belongs to the user of the session'
);
select lives_ok(
  $$ insert into public.habits (id, name, type, created_on)
     values ('aaaaaaaa-0000-4000-8000-000000000011', 'Write daily', 'boolean', '2026-11-03')
     on conflict (id) do update set name = excluded.name $$,
  'Ana uploads a change to her habit as an upsert'
);
select lives_ok(
  $$ update public.entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  'Ana deletes an entry logically'
);

select throws_ok(
  $$ insert into public.habits (id, user_id, name, type, created_on)
     values ('aaaaaaaa-0000-4000-8000-000000000012', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Spy', 'boolean', '2026-11-03') $$,
  '42501', null,
  'Ana cannot create a habit for Bea'
);
select throws_ok(
  $$ insert into public.entries (id, habit_id, date, value)
     values ('aaaaaaaa-0000-4000-8000-000000000013', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-11-03', 1) $$,
  '23503', null,
  'Ana cannot hang an entry from a habit of Bea'
);
select is_empty(
  $$ update public.habits set name = 'Hacked' where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  'Ana cannot change a habit of Bea'
);
select throws_ok(
  $$ insert into public.habits (id, name, type, created_on)
     values ('bbbbbbbb-0000-4000-8000-000000000001', 'Hacked', 'boolean', '2026-11-03')
     on conflict (id) do update set name = excluded.name $$,
  '42501', null,
  'Ana cannot overwrite a habit of Bea with an upsert'
);
select throws_ok(
  $$ update public.habits set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null,
  'Ana cannot give a habit to Bea'
);
select throws_ok(
  $$ delete from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501', null,
  'Ana cannot delete her habits physically'
);
select throws_ok(
  'truncate public.entries', '42501', null,
  'Ana cannot empty a table'
);
reset role;

-- Bea's rows did not change.
select is(
  (select name from public.habits where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'Run',
  'The habit of Bea keeps its name'
);

-- Deleting the account deletes its rows, and only its rows (RF-04).
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*)::int from public.habits) + (select count(*)::int from public.habit_versions)
    + (select count(*)::int from public.entries) + (select count(*)::int from public.reminders)
    + (select count(*)::int from public.tasks),
  5,
  'Deleting the account of Ana leaves only the five rows of Bea'
);
select is_empty(
  $$ select 1 from public.habits where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'No habit of Ana remains'
);

select * from finish();
rollback;
