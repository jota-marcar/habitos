-- Who can do what on each table: only signed-in users, with no physical deletion, and with
-- Row Level Security enabled (supabase/migrations, ADR-0015).
begin;
select plan(28);

select ok(
  (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass),
  format('%s has Row Level Security enabled', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'weekly_goals', 'weekly_goal_versions', 'weekly_goal_entries']) as t;

select table_privs_are(
  'public', t, 'anon', array[]::text[],
  format('anon has no access to %s', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'weekly_goals', 'weekly_goal_versions', 'weekly_goal_entries']) as t;

select table_privs_are(
  'public', t, 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  format('authenticated can read, insert and update %s, but not delete or truncate', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'weekly_goals', 'weekly_goal_versions', 'weekly_goal_entries']) as t;

select policies_are('public', 'habits', array[
  'Users read their own habits',
  'Users create their own habits',
  'Users update their own habits'
]);
select policies_are('public', 'habit_versions', array[
  'Users read their own habit versions',
  'Users create their own habit versions',
  'Users update their own habit versions'
]);
select policies_are('public', 'entries', array[
  'Users read their own entries',
  'Users create their own entries',
  'Users update their own entries'
]);
select policies_are('public', 'reminders', array[
  'Users read their own reminders',
  'Users create their own reminders',
  'Users update their own reminders'
]);
select policies_are('public', 'weekly_goals', array[
  'Users read their own weekly goals',
  'Users create their own weekly goals',
  'Users update their own weekly goals'
]);
select policies_are('public', 'weekly_goal_versions', array[
  'Users read their own weekly goal versions',
  'Users create their own weekly goal versions',
  'Users update their own weekly goal versions'
]);
select policies_are('public', 'weekly_goal_entries', array[
  'Users read their own weekly goal entries',
  'Users create their own weekly goal entries',
  'Users update their own weekly goal entries'
]);

select * from finish();
rollback;
