-- Deleting is for good (RF-11, RF-45, ADR-0023). A deleted row stays only as the marker that the
-- synchronization needs, with its id, its owner and its parent, and without anything the user
-- wrote or recorded. The columns that cannot be null get a fixed value: 1970-01-05 is a Monday,
-- so it is valid for the columns of a week too.
--
-- The rule lives in the database so that it holds for every version of the app, also for those
-- that upload a deleted row with its content:
-- - A deleted row is emptied.
-- - A deleted row stays deleted, even if a device with older changes uploads it as live.
-- - A row of a deleted parent is deleted too.
--
-- The trigger is named so that it runs after set_updated_at, which takes the lock of the user
-- (ADR-0016): the parent it reads cannot be changing in another upload of the same account.
create function public.tombstone_deleted_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  emptied constant jsonb := tg_argv[0]::jsonb;
  parent_table constant text := tg_argv[1];
  parent_column constant text := tg_argv[2];
  parent_deleted boolean;
begin
  if tg_op = 'UPDATE' and old.deleted then
    new.deleted := true;
  end if;

  if not new.deleted and parent_table is not null then
    execute pg_catalog.format('select deleted from public.%I where id = $1', parent_table)
      into parent_deleted
      using (pg_catalog.to_jsonb(new) ->> parent_column)::uuid;
    new.deleted := coalesce(parent_deleted, false);
  end if;

  if new.deleted then
    new := pg_catalog.jsonb_populate_record(new, emptied);
  end if;
  return new;
end;
$$;

-- The same values as EMPTIED_VALUES in src/data/emptied-rows.ts.
create trigger tombstone_deleted_row before insert or update on public.habits
  for each row execute function public.tombstone_deleted_row(
    '{"name": "", "type": "boolean", "color": null, "created_on": "1970-01-05", "archived_on": null}'
  );
create trigger tombstone_deleted_row before insert or update on public.habit_versions
  for each row execute function public.tombstone_deleted_row(
    '{"effective_from": "1970-01-05", "scheduled_days": 127, "target": null, "unit": null, "increment": null}',
    'habits', 'habit_id'
  );
create trigger tombstone_deleted_row before insert or update on public.entries
  for each row execute function public.tombstone_deleted_row(
    '{"date": "1970-01-05", "value": 0}',
    'habits', 'habit_id'
  );
create trigger tombstone_deleted_row before insert or update on public.reminders
  for each row execute function public.tombstone_deleted_row(
    '{"time": "00:00"}',
    'habits', 'habit_id'
  );
create trigger tombstone_deleted_row before insert or update on public.weekly_goals
  for each row execute function public.tombstone_deleted_row(
    '{"name": "", "type": "boolean", "color": null, "first_week": "1970-01-05", "archived_week": null}'
  );
create trigger tombstone_deleted_row before insert or update on public.weekly_goal_versions
  for each row execute function public.tombstone_deleted_row(
    '{"effective_from": "1970-01-05", "target": null, "unit": null, "increment": null}',
    'weekly_goals', 'weekly_goal_id'
  );
create trigger tombstone_deleted_row before insert or update on public.weekly_goal_entries
  for each row execute function public.tombstone_deleted_row(
    '{"week": "1970-01-05", "value": 0}',
    'weekly_goals', 'weekly_goal_id'
  );

-- What was already deleted, and what was left alive under a deleted parent. The trigger empties
-- each row and gives it a new updated_at, so that the devices download it and empty their copy
-- too: no migration of the local database is needed. This cannot be undone.
update public.habits set deleted = true where deleted;
update public.weekly_goals set deleted = true where deleted;

update public.habit_versions child set deleted = true
  where child.deleted
     or exists (select 1 from public.habits parent where parent.id = child.habit_id and parent.deleted);
update public.entries child set deleted = true
  where child.deleted
     or exists (select 1 from public.habits parent where parent.id = child.habit_id and parent.deleted);
update public.reminders child set deleted = true
  where child.deleted
     or exists (select 1 from public.habits parent where parent.id = child.habit_id and parent.deleted);
update public.weekly_goal_versions child set deleted = true
  where child.deleted
     or exists (select 1 from public.weekly_goals parent where parent.id = child.weekly_goal_id and parent.deleted);
update public.weekly_goal_entries child set deleted = true
  where child.deleted
     or exists (select 1 from public.weekly_goals parent where parent.id = child.weekly_goal_id and parent.deleted);
