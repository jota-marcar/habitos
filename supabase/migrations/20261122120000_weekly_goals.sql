-- Weekly goals (ADR-0022): the same tables as the local database (src/data/migrations.ts), with
-- the same differences as the initial schema. A week is stored as its Monday.

create table public.weekly_goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('boolean', 'quantitative')),
  -- The key of a color of the palette, or null (ADR-0014).
  color text,
  recurring boolean not null,
  first_week date not null check (extract(isodow from first_week) = 1),
  archived_week date check (extract(isodow from archived_week) = 1),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- Only recurring goals are archived: a one-off goal ends with its week.
  check (recurring or archived_week is null),
  -- Target of the foreign keys of the other tables.
  unique (id, user_id)
);

create table public.weekly_goal_versions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekly_goal_id uuid not null,
  effective_from date not null check (extract(isodow from effective_from) = 1),
  target double precision,
  unit text,
  increment double precision,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (weekly_goal_id, user_id)
    references public.weekly_goals (id, user_id) on delete cascade
);

create table public.weekly_goal_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekly_goal_id uuid not null,
  week date not null check (extract(isodow from week) = 1),
  value double precision not null check (value >= 0),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (weekly_goal_id, user_id)
    references public.weekly_goals (id, user_id) on delete cascade
);

-- The same unique keys as on the device. They leave out deleted rows, so that what was
-- deleted can be created again.
create unique index weekly_goal_versions_goal_effective_from
  on public.weekly_goal_versions (weekly_goal_id, effective_from) where not deleted;
create unique index weekly_goal_entries_goal_week
  on public.weekly_goal_entries (weekly_goal_id, week) where not deleted;

-- The pull reads the rows of a user changed after a cursor, in order (ADR-0016).
create index weekly_goals_user_updated_at
  on public.weekly_goals (user_id, updated_at, id);
create index weekly_goal_versions_user_updated_at
  on public.weekly_goal_versions (user_id, updated_at, id);
create index weekly_goal_entries_user_updated_at
  on public.weekly_goal_entries (user_id, updated_at, id);

create trigger set_updated_at before insert or update on public.weekly_goals
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.weekly_goal_versions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.weekly_goal_entries
  for each row execute function public.set_updated_at();

-- Access: only signed-in users, and only to their own rows, with no physical deletion.
revoke all on table public.weekly_goals, public.weekly_goal_versions, public.weekly_goal_entries
  from anon, authenticated;
grant select, insert, update
  on table public.weekly_goals, public.weekly_goal_versions, public.weekly_goal_entries
  to authenticated;

alter table public.weekly_goals enable row level security;
alter table public.weekly_goal_versions enable row level security;
alter table public.weekly_goal_entries enable row level security;

-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Users read their own weekly goals" on public.weekly_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own weekly goals" on public.weekly_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own weekly goals" on public.weekly_goals
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own weekly goal versions" on public.weekly_goal_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own weekly goal versions" on public.weekly_goal_versions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own weekly goal versions" on public.weekly_goal_versions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own weekly goal entries" on public.weekly_goal_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own weekly goal entries" on public.weekly_goal_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own weekly goal entries" on public.weekly_goal_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
