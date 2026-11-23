// Reads and writes reminders in the local database.

import type { Reminder } from "@/domain/reminders";
import { localTime } from "@/domain/times";

import type { Database } from "./database";
import { markDeleted } from "./emptied-rows";

interface ReminderRow {
  id: string;
  habit_id: string;
  time: string;
}

function toReminder(row: ReminderRow): Reminder {
  return { id: row.id, habitId: row.habit_id, time: localTime(row.time) };
}

/** The reminders of every habit, from the earliest time of day to the latest. */
export async function listReminders(db: Database): Promise<Reminder[]> {
  const rows = await db.all<ReminderRow>(
    `SELECT id, habit_id, time
       FROM reminders
      WHERE deleted = 0
      ORDER BY time, rowid`,
  );
  return rows.map(toReminder);
}

/** Adds a reminder. The database rejects a second one at the same time for the same habit. */
export async function addReminder(
  db: Database,
  reminder: Reminder,
): Promise<void> {
  await db.run(`INSERT INTO reminders (id, habit_id, time) VALUES (?, ?, ?)`, [
    reminder.id,
    reminder.habitId,
    reminder.time,
  ]);
}

/**
 * Deletes a reminder. Only its marker stays, empty, to propagate it (ADR-0004, ADR-0023).
 */
export async function deleteReminder(
  db: Database,
  reminderId: string,
): Promise<void> {
  await markDeleted(db, "reminders", "id = ?", [reminderId]);
}
