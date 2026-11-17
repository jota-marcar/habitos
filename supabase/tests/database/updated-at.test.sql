-- updated_at is the cursor of the synchronization: the server assigns it on every write,
-- after taking the lock of the user (ADR-0016).
begin;
select plan(7);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@example.com');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';

insert into public.habits (id, name, type, created_on, updated_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Read', 'boolean', '2026-11-01', '2000-01-01');

select cmp_ok(
  (select updated_at from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  '>=', now(),
  'On insert, the server ignores the updated_at of the client'
);
reset role;

select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and granted
  ),
  'A write holds the lock of its user until the end of the transaction'
);

create temporary table before_update as
  select updated_at from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000001';
grant select on before_update to authenticated;

set local role authenticated;
update public.habits set name = 'Read more' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select cmp_ok(
  (select updated_at from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  '>', (select updated_at from before_update),
  'Every update moves updated_at forward, even within the same transaction'
);

update public.habits set updated_at = '2000-01-01' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select cmp_ok(
  (select updated_at from public.habits where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  '>', (select updated_at from before_update),
  'On update, the server ignores the updated_at of the client'
);

select throws_ok(
  $$ update public.habits set id = 'aaaaaaaa-0000-4000-8000-000000000009'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null,
  'The id of a row cannot change'
);
reset role;

-- The same trigger is on every table.
select has_trigger('public', t, 'set_updated_at', format('%s assigns updated_at', t))
from unnest(array['habit_versions', 'entries']) as t;

select * from finish();
rollback;
