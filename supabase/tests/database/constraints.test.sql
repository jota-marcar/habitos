-- The same rules as the local database (src/data/migrations.ts): valid values and one live
-- row per natural key.
begin;
select plan(12);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com');
insert into public.habits (id, user_id, name, type, created_on) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Read', 'boolean', '2026-11-01');

select throws_ok(
  $$ insert into public.habits (id, user_id, name, type, created_on)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Swim', 'daily', '2026-11-01') $$,
  '23514', null,
  'A habit is boolean or quantitative'
);

select throws_ok(
  format(
    $$ insert into public.habit_versions (id, user_id, habit_id, effective_from, scheduled_days)
       values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', %s) $$,
    days
  ),
  '23514', null,
  format('A version cannot have %s as its scheduled days', days)
)
from unnest(array[0, 128]) as days;

select throws_ok(
  $$ insert into public.entries (id, user_id, habit_id, date, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', -1) $$,
  '23514', null,
  'An entry cannot have a negative value'
);

select throws_ok(
  format(
    $$ insert into public.reminders (id, user_id, habit_id, time)
       values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', %L) $$,
    bad_time
  ),
  '23514', null,
  format('A reminder cannot be at %s', bad_time)
)
from unnest(array['24:00', '7:30', '07:30:00']) as bad_time;

select lives_ok(
  $$ insert into public.reminders (id, user_id, habit_id, time)
     values ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '07:30') $$,
  'A reminder is a time in HH:MM'
);

-- One live entry per habit and day; a deleted one does not count.
insert into public.entries (id, user_id, habit_id, date, value) values
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', 1);
select throws_ok(
  $$ insert into public.entries (id, user_id, habit_id, date, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', 1) $$,
  '23505', null,
  'A habit has a single live entry per day'
);
update public.entries set deleted = true where id = 'aaaaaaaa-0000-4000-8000-000000000003';
select lives_ok(
  $$ insert into public.entries (id, user_id, habit_id, date, value)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-02', 1) $$,
  'A deleted entry can be created again'
);

select throws_ok(
  $$ insert into public.reminders (id, user_id, habit_id, time)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '07:30') $$,
  '23505', null,
  'A habit has a single live reminder per time'
);

insert into public.habit_versions (id, user_id, habit_id, effective_from, scheduled_days) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-01', 127);
select throws_ok(
  $$ insert into public.habit_versions (id, user_id, habit_id, effective_from, scheduled_days)
     values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-01', 31) $$,
  '23505', null,
  'A habit has a single live version per start date'
);

select * from finish();
rollback;
