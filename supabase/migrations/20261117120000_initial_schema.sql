-- Cloud schema: the same tables as the local database (src/data/migrations.ts), plus the
-- owner of each row (ADR-0003, ADR-0004, ADR-0015, ADR-0016).
--
-- Differences with the local schema, on purpose:
-- - user_id: only here. The device holds a single account, and the server assigns the user
--   of the session when a row is uploaded.
-- - pending_sync: only on the device.
-- - updated_at: assigned by a trigger, never by the client (see set_updated_at below).
-- - Types: uuid, date, boolean and double precision where SQLite stores text, 0/1 and REAL.
--   Times stay as text in HH:MM, like on the device, because a Postgres time would come back
--   as HH:MM:SS.
-- - The foreign keys include user_id, so that a row can only hang from a habit of its own
--   user: foreign key checks do not go through Row Level Security.
--
-- A migration is never edited once it has been applied to a project: a change to the schema
-- is a new migration, together with the local one in the same Pull Request.

-- Synchronization cursor (ADR-0016). Every write of a user takes a lock of that user, held
-- until the transaction ends, and only then reads the clock. The writes of a user are thus
-- serialized, and their updated_at follows the order in which they commit: a pull that has
-- seen a row will never miss a row with an earlier updated_at that commits later.
-- clock_timestamp() and not now(): now() is the start of the transaction, before the lock.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.user_id <> old.user_id) then
    raise exception 'The id and the user of a row cannot change'
      using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create table public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('boolean', 'quantitative')),
  created_on date not null,
  archived_on date,
  -- The key of a color of the palette, or null (ADR-0014).
  color text,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- Target of the foreign keys of the other tables.
  unique (id, user_id)
);

create table public.habit_versions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  effective_from date not null,
  scheduled_days smallint not null check (scheduled_days between 1 and 127),
  target double precision,
  unit text,
  increment double precision,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create table public.entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  value double precision not null check (value >= 0),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create table public.reminders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

-- The same unique keys as on the device. They leave out deleted rows, so that what was
-- deleted can be created again.
create unique index habit_versions_habit_effective_from
  on public.habit_versions (habit_id, effective_from) where not deleted;
create unique index entries_habit_date
  on public.entries (habit_id, date) where not deleted;
create unique index reminders_habit_time
  on public.reminders (habit_id, time) where not deleted;

-- The pull reads the rows of a user changed after a cursor, in order (ADR-0016).
create index habits_user_updated_at on public.habits (user_id, updated_at, id);
create index habit_versions_user_updated_at on public.habit_versions (user_id, updated_at, id);
create index entries_user_updated_at on public.entries (user_id, updated_at, id);
create index reminders_user_updated_at on public.reminders (user_id, updated_at, id);

create trigger set_updated_at before insert or update on public.habits
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.habit_versions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.entries
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.reminders
  for each row execute function public.set_updated_at();

-- Access: only signed-in users, and only to their own rows. There is no physical deletion
-- from the app: deletions travel as deleted = true, and the rows only disappear with the
-- account (on delete cascade from auth.users). That is why there is no delete policy and
-- neither delete nor truncate is granted (truncate does not go through Row Level Security).
revoke all on table public.habits, public.habit_versions, public.entries, public.reminders
  from anon, authenticated;
grant select, insert, update
  on table public.habits, public.habit_versions, public.entries, public.reminders
  to authenticated;

alter table public.habits enable row level security;
alter table public.habit_versions enable row level security;
alter table public.entries enable row level security;
alter table public.reminders enable row level security;

-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Users read their own habits" on public.habits
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own habits" on public.habits
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own habits" on public.habits
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own habit versions" on public.habit_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own habit versions" on public.habit_versions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own habit versions" on public.habit_versions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own entries" on public.entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own entries" on public.entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own entries" on public.entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own reminders" on public.reminders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own reminders" on public.reminders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own reminders" on public.reminders
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
