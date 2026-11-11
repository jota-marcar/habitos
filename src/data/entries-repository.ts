// Reads and writes entries in the local database.

import { localDate, type LocalDate } from "@/domain/dates";
import type { Entry } from "@/domain/entries";

import type { Database } from "./database";

interface EntryRow {
  id: string;
  habit_id: string;
  date: string;
  value: number;
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: localDate(row.date),
    value: row.value,
  };
}

/** The entries from `from` to `to`, both included. */
export async function listEntries(
  db: Database,
  from: LocalDate,
  to: LocalDate,
): Promise<Entry[]> {
  const rows = await db.all<EntryRow>(
    `SELECT id, habit_id, date, value
       FROM entries
      WHERE deleted = 0 AND date BETWEEN ? AND ?
      ORDER BY date, rowid`,
    [from, to],
  );
  return rows.map(toEntry);
}

/**
 * Records the value of a habit on a day. There is one entry per habit and day: if there is
 * already one, its value is replaced and it keeps its identifier.
 */
export async function saveEntry(db: Database, entry: Entry): Promise<void> {
  await db.run(
    `INSERT INTO entries (id, habit_id, date, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (habit_id, date) WHERE deleted = 0 DO UPDATE SET
       value = excluded.value,
       pending_sync = 1`,
    [entry.id, entry.habitId, entry.date, entry.value],
  );
}
