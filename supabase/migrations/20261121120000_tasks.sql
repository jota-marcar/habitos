-- Tasks: something to do once, before a due day and time (ADR-0021). The same table as on the
-- device (src/data/migrations.ts), with the differences described in the initial schema. Their
-- state is not stored: it follows from value, completed_on and the due moment.

create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('boolean', 'quantitative')),
  -- The key of a color of the palette, or null (ADR-0014).
  color text,
  target double precision,
  unit text,
  increment double precision,
  due_on date not null,
  due_time text not null check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  value double precision not null default 0 check (value >= 0),
  completed_on date,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- The pull reads the rows of a user changed after a cursor, in order (ADR-0016).
create index tasks_user_updated_at on public.tasks (user_id, updated_at, id);

create trigger set_updated_at before insert or update on public.tasks
  for each row execute function public.set_updated_at();

-- Access: only signed-in users, and only to their own rows, with no physical deletion from the
-- app, like the other tables.
revoke all on table public.tasks from anon, authenticated;
grant select, insert, update on table public.tasks to authenticated;

alter table public.tasks enable row level security;

-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Users read their own tasks" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own tasks" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own tasks" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
