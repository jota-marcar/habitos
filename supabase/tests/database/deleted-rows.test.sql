-- Deleting is for good (RF-11, RF-45, ADR-0023): a deleted row keeps nothing the user wrote or
-- recorded, and it cannot come back.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com');

insert into public.habits (id, user_id, name, type, color, created_on) values
  ('aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Secret', 'quantitative', 'blue', '2026-11-02'),
  ('aaaaaaaa-0000-4000-8000-000000000032', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Kept', 'boolean', 'teal', '2026-11-02');
insert into public.habit_versions (id, user_id, habit_id, effective_from, scheduled_days, target, unit, increment) values
  ('aaaaaaaa-0000-4000-8000-000000000033', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000031', '2026-11-02', 3, 2, 'L', 0.5);
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000034', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000031', '2026-11-03', 1.5),
  ('aaaaaaaa-0000-4000-8000-000000000035', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000032', '2026-11-03', 1);
insert into public.reminders (id, user_id, habit_id, time) values
  ('aaaaaaaa-0000-4000-8000-000000000036', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000031', '08:30');
insert into public.weekly_goals (id, user_id, name, type, color, recurring, first_week, archived_week) values
  ('aaaaaaaa-0000-4000-8000-000000000037', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Secret goal', 'quantitative', 'blue', true, '2026-11-02', '2026-11-16');
insert into public.weekly_goal_versions (id, user_id, weekly_goal_id, effective_from, target, unit, increment) values
  ('aaaaaaaa-0000-4000-8000-000000000038', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-11-02', 5, 'h', 1);
insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value) values
  ('aaaaaaaa-0000-4000-8000-000000000039', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-11-02', 3);
insert into public.long_term_goals (id, user_id, name, type, color, target, unit, increment, first_day, deadline) values
  ('aaaaaaaa-0000-4000-8000-000000000042', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Secret long-term goal', 'quantitative', 'blue', 24, 'books', 1, '2026-11-25', '2026-12-31');
insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value) values
  ('aaaaaaaa-0000-4000-8000-000000000043', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000042', 5);

-- Deleting empties each row.
update public.habits set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000031';
update public.habit_versions set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000033';
update public.entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000034';
update public.reminders set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000036';
update public.weekly_goals set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000037';
update public.weekly_goal_versions set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000038';
update public.weekly_goal_entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000039';
update public.long_term_goals set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000042';

select results_eq(
  $$ select name, type, color, created_on, archived_on from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000031' $$,
  $$ values ('', 'boolean', null::text, '1970-01-05'::date, null::date) $$,
  'A deleted habit keeps nothing'
);
select results_eq(
  $$ select effective_from, scheduled_days, target, unit, increment from public.habit_versions where id = 'aaaaaaaa-0000-4000-8000-000000000033' $$,
  $$ values ('1970-01-05'::date, 127::smallint, null::double precision, null::text, null::double precision) $$,
  'A deleted version keeps nothing'
);
select results_eq(
  $$ select date, value from public.entries where id = 'aaaaaaaa-0000-4000-8000-000000000034' $$,
  $$ values ('1970-01-05'::date, 0::double precision) $$,
  'A deleted entry keeps nothing'
);
select results_eq(
  $$ select time from public.reminders where id = 'aaaaaaaa-0000-4000-8000-000000000036' $$,
  $$ values ('00:00'::text) $$,
  'A deleted reminder keeps nothing'
);
select results_eq(
  $$ select name, type, color, first_week, archived_week from public.weekly_goals where id = 'aaaaaaaa-0000-4000-8000-000000000037' $$,
  $$ values ('', 'boolean', null::text, '1970-01-05'::date, null::date) $$,
  'A deleted goal keeps nothing'
);
select results_eq(
  $$ select effective_from, target, unit, increment from public.weekly_goal_versions where id = 'aaaaaaaa-0000-4000-8000-000000000038' $$,
  $$ values ('1970-01-05'::date, null::double precision, null::text, null::double precision) $$,
  'A deleted version of a goal keeps nothing'
);
select results_eq(
  $$ select week, value from public.weekly_goal_entries where id = 'aaaaaaaa-0000-4000-8000-000000000039' $$,
  $$ values ('1970-01-05'::date, 0::double precision) $$,
  'A deleted total keeps nothing'
);
select results_eq(
  $$ select name, type, color, target, unit, increment, first_day, deadline from public.long_term_goals where id = 'aaaaaaaa-0000-4000-8000-000000000042' $$,
  $$ values ('', 'boolean', null::text, null::double precision, null::text, null::double precision, '1970-01-05'::date, '1970-01-06'::date) $$,
  'A deleted long-term goal keeps nothing'
);

-- It cannot come back.
update public.habits set deleted = false, name = 'Back' where id = 'aaaaaaaa-0000-4000-8000-000000000031';
select results_eq(
  $$ select deleted, name from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000031' $$,
  $$ values (true, '') $$,
  'A deleted row stays deleted and empty'
);
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000034', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000031', '2026-11-03', 2)
  on conflict (id) do update set date = excluded.date, value = excluded.value, deleted = excluded.deleted;
select results_eq(
  $$ select deleted, date, value from public.entries where id = 'aaaaaaaa-0000-4000-8000-000000000034' $$,
  $$ values (true, '1970-01-05'::date, 0::double precision) $$,
  'An upload of older changes does not bring it back'
);

-- A row of a deleted parent is deleted too.
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000040', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000031', '2026-11-04', 2);
select results_eq(
  $$ select deleted, date, value from public.entries where id = 'aaaaaaaa-0000-4000-8000-000000000040' $$,
  $$ values (true, '1970-01-05'::date, 0::double precision) $$,
  'A new entry of a deleted habit arrives deleted and empty'
);
insert into public.weekly_goal_entries (id, user_id, weekly_goal_id, week, value) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-11-09', 2);
select results_eq(
  $$ select deleted, value from public.weekly_goal_entries where id = 'aaaaaaaa-0000-4000-8000-000000000041' $$,
  $$ values (true, 0::double precision) $$,
  'A new total of a deleted goal arrives deleted and empty'
);
update public.long_term_goal_entries set value = 6 where id = 'aaaaaaaa-0000-4000-8000-000000000043';
select results_eq(
  $$ select deleted, value from public.long_term_goal_entries where id = 'aaaaaaaa-0000-4000-8000-000000000043' $$,
  $$ values (true, 0::double precision) $$,
  'A total of a deleted long-term goal ends up deleted and empty when it is uploaded'
);
insert into public.long_term_goal_entries (id, user_id, long_term_goal_id, value) values
  ('aaaaaaaa-0000-4000-8000-000000000044', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000042', 2);
select results_eq(
  $$ select deleted, value from public.long_term_goal_entries where id = 'aaaaaaaa-0000-4000-8000-000000000044' $$,
  $$ values (true, 0::double precision) $$,
  'A new total of a deleted long-term goal arrives deleted and empty'
);

-- What is alive is not touched.
select results_eq(
  $$ select name, type, color, created_on, deleted from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000032' $$,
  $$ values ('Kept', 'boolean', 'teal'::text, '2026-11-02'::date, false) $$,
  'A live habit keeps its data'
);
select results_eq(
  $$ select date, value, deleted from public.entries where id = 'aaaaaaaa-0000-4000-8000-000000000035' $$,
  $$ values ('2026-11-03'::date, 1::double precision, false) $$,
  'A live entry keeps its data'
);
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000042', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000032', '2026-11-04', 2);
select results_eq(
  $$ select date, value, deleted from public.entries where id = 'aaaaaaaa-0000-4000-8000-000000000042' $$,
  $$ values ('2026-11-04'::date, 2::double precision, false) $$,
  'A new entry of a live habit stays as it is'
);

select * from finish();
rollback;
