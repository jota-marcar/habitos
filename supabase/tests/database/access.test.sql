-- Who can do what on each table: only signed-in users, with no physical deletion, and with
-- Row Level Security enabled (supabase/migrations, ADR-0015).
begin;
select plan(21);

select ok(
  (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass),
  format('%s has Row Level Security enabled', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'tasks']) as t;

select table_privs_are(
  'public', t, 'anon', array[]::text[],
  format('anon has no access to %s', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'tasks']) as t;

select table_privs_are(
  'public', t, 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  format('authenticated can read, insert and update %s, but not delete or truncate', t)
)
from unnest(array['habits', 'habit_versions', 'entries', 'reminders', 'tasks']) as t;

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
select policies_are('public', 'tasks', array[
  'Users read their own tasks',
  'Users create their own tasks',
  'Users update their own tasks'
]);
select has_trigger('public', 'tasks', 'set_updated_at', 'The server assigns updated_at in tasks');

select * from finish();
rollback;
