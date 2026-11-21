// Reads and writes tasks in the local database (ADR-0021). Every write marks the row as pending
// synchronization; deleted rows are never returned.

import { localDate } from "@/domain/dates";
import { parseHabitColor, type HabitType } from "@/domain/habits";
import type { Task } from "@/domain/tasks";
import { localTime } from "@/domain/times";

import type { Database } from "./database";

interface TaskRow {
  id: string;
  name: string;
  type: string;
  color: string | null;
  target: number | null;
  unit: string | null;
  increment: number | null;
  due_on: string;
  due_time: string;
  value: number;
  completed_on: string | null;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    // The table only admits the two types.
    type: row.type as HabitType,
    // A key this version does not know is read as no color (ADR-0014).
    color: parseHabitColor(row.color),
    target: row.target,
    unit: row.unit,
    increment: row.increment,
    dueOn: localDate(row.due_on),
    dueTime: localTime(row.due_time),
    value: row.value,
    completedOn: row.completed_on === null ? null : localDate(row.completed_on),
  };
}

/** Every task, in the order they were created. */
export async function listTasks(db: Database): Promise<Task[]> {
  const rows = await db.all<TaskRow>(
    `SELECT id, name, type, color, target, unit, increment, due_on, due_time, value,
            completed_on
       FROM tasks
      WHERE deleted = 0
      ORDER BY rowid`,
  );
  return rows.map(toTask);
}

/** Creates a task or updates what can change in it: everything but its type (RF-41). */
export async function saveTask(db: Database, task: Task): Promise<void> {
  await db.run(
    `INSERT INTO tasks
       (id, name, type, color, target, unit, increment, due_on, due_time, value, completed_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       target = excluded.target,
       unit = excluded.unit,
       increment = excluded.increment,
       due_on = excluded.due_on,
       due_time = excluded.due_time,
       value = excluded.value,
       completed_on = excluded.completed_on,
       pending_sync = 1`,
    [
      task.id,
      task.name,
      task.type,
      task.color,
      task.target,
      task.unit,
      task.increment,
      task.dueOn,
      task.dueTime,
      task.value,
      task.completedOn,
    ],
  );
}

/**
 * Deletes a task (RF-41). The row is only marked as deleted, so that the synchronization can
 * propagate it (ADR-0004).
 */
export async function deleteTask(db: Database, taskId: string): Promise<void> {
  await db.run("UPDATE tasks SET deleted = 1, pending_sync = 1 WHERE id = ?", [
    taskId,
  ]);
}
