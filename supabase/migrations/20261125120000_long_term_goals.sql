-- Long-term goals (ADR-0027): the same tables as the local database (src/data/migrations.ts),
-- with the same differences as the initial schema. The configuration has no versions, and each
-- goal has a single total.

create table public.long_term_goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('boolean', 'quantitative')),
  -- The key of a color of the palette, or null (ADR-0014).
  color text,
  target double precision,
  unit text,
  increment double precision,
  first_day date not null,
  deadline date not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- Also in an emptied row: its deadline is the day after its first day (ADR-0023).
  check (deadline > first_day),
  -- Target of the foreign key of the totals.
  unique (id, user_id)
);

create table public.long_term_goal_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  long_term_goal_id uuid not null,
  value double precision not null check (value >= 0),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  foreign key (long_term_goal_id, user_id)
    references public.long_term_goals (id, user_id) on delete cascade
);

-- The same unique key as on the device: a single live total per goal.
create unique index long_term_goal_entries_goal
  on public.long_term_goal_entries (long_term_goal_id) where not deleted;

-- The pull reads the rows of a user changed after a cursor, in order (ADR-0016).
create index long_term_goals_user_updated_at
  on public.long_term_goals (user_id, updated_at, id);
create index long_term_goal_entries_user_updated_at
  on public.long_term_goal_entries (user_id, updated_at, id);

create trigger set_updated_at before insert or update on public.long_term_goals
  for each row execute function public.set_updated_at();
create trigger set_updated_at before insert or update on public.long_term_goal_entries
  for each row execute function public.set_updated_at();

-- Deleting is for good (ADR-0023). The same values as EMPTIED_VALUES in
-- src/data/emptied-rows.ts.
create trigger tombstone_deleted_row before insert or update on public.long_term_goals
  for each row execute function public.tombstone_deleted_row(
    '{"name": "", "type": "boolean", "color": null, "target": null, "unit": null, "increment": null, "first_day": "1970-01-05", "deadline": "1970-01-06"}'
  );
create trigger tombstone_deleted_row before insert or update on public.long_term_goal_entries
  for each row execute function public.tombstone_deleted_row(
    '{"value": 0}',
    'long_term_goals', 'long_term_goal_id'
  );

-- Access: only signed-in users, and only to their own rows, with no physical deletion.
revoke all on table public.long_term_goals, public.long_term_goal_entries
  from anon, authenticated;
grant select, insert, update
  on table public.long_term_goals, public.long_term_goal_entries
  to authenticated;

alter table public.long_term_goals enable row level security;
alter table public.long_term_goal_entries enable row level security;

-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Users read their own long-term goals" on public.long_term_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own long-term goals" on public.long_term_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own long-term goals" on public.long_term_goals
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users read their own long-term goal entries" on public.long_term_goal_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own long-term goal entries" on public.long_term_goal_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own long-term goal entries" on public.long_term_goal_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
