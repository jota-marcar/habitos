import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";

import { deleteAccountData, hasPendingChanges } from "./account-data";
import { saveEntry } from "./entries-repository";
import {
  addHabit,
  deleteHabit,
  saveHabit,
  saveHabitVersion,
} from "./habits-repository";
import {
  saveLongTermGoal,
  saveLongTermGoalEntry,
} from "./long-term-goals-repository";
import { addReminder } from "./reminders-repository";
import {
  habit,
  longTermGoal,
  markSynced,
  openMigratedDatabase,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";
import { addWeeklyGoal, saveWeeklyGoalEntry } from "./weekly-goals-repository";

const TABLES = [
  "habits",
  "habit_versions",
  "entries",
  "reminders",
  "weekly_goals",
  "weekly_goal_versions",
  "weekly_goal_entries",
  "long_term_goals",
  "long_term_goal_entries",
];

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

/** A habit with a row in every table of the account. */
async function addFullHabit(id: string): Promise<void> {
  await addHabit(db, habit(id), version(id));
  await saveEntry(db, {
    id: `${id}-entry`,
    habitId: id,
    date: localDate("2026-11-12"),
    value: 1,
  });
  await addReminder(db, {
    id: `${id}-reminder`,
    habitId: id,
    time: localTime("08:30"),
  });
}

/** A long-term goal with its total. */
async function addFullLongTermGoal(id: string): Promise<void> {
  await saveLongTermGoal(db, longTermGoal(id));
  await saveLongTermGoalEntry(db, {
    id: `${id}-entry`,
    longTermGoalId: id,
    value: 1,
  });
}

/** A weekly goal with a row in each of its tables. */
async function addFullWeeklyGoal(id: string): Promise<void> {
  await addWeeklyGoal(db, weeklyGoal(id), weeklyGoalVersion(id));
  await saveWeeklyGoalEntry(db, {
    id: `${id}-entry`,
    weeklyGoalId: id,
    week: localDate("2026-11-16"),
    value: 1,
  });
}

async function markAllSynced(): Promise<void> {
  for (const table of TABLES) await markSynced(db, table);
}

describe("hasPendingChanges", () => {
  test("an empty device has nothing pending", async () => {
    expect(await hasPendingChanges(db)).toBe(false);
  });

  test("nothing is pending once everything has been uploaded", async () => {
    await addFullHabit("water");
    await markAllSynced();

    expect(await hasPendingChanges(db)).toBe(false);
  });

  test("a habit that has not been uploaded is pending", async () => {
    await saveHabit(db, habit("water"));

    expect(await hasPendingChanges(db)).toBe(true);
  });

  test.each([
    [
      "a version",
      () =>
        saveHabitVersion(
          db,
          version("water", {
            id: "water-v2",
            effectiveFrom: localDate("2026-11-12"),
          }),
        ),
    ],
    [
      "an entry",
      () =>
        saveEntry(db, {
          id: "water-entry",
          habitId: "water",
          date: localDate("2026-11-12"),
          value: 0,
        }),
    ],
    [
      "a reminder",
      () =>
        addReminder(db, {
          id: "water-evening",
          habitId: "water",
          time: localTime("21:00"),
        }),
    ],
  ])("%s changed after the upload is pending", async (_, change) => {
    await addFullHabit("water");
    await markAllSynced();

    await change();

    expect(await hasPendingChanges(db)).toBe(true);
  });

  test("a weekly goal that has not been uploaded is pending", async () => {
    await addFullWeeklyGoal("run");

    expect(await hasPendingChanges(db)).toBe(true);

    await markAllSynced();

    expect(await hasPendingChanges(db)).toBe(false);
  });

  test("a long-term goal that has not been uploaded is pending", async () => {
    await addFullLongTermGoal("books");

    expect(await hasPendingChanges(db)).toBe(true);

    await markAllSynced();

    expect(await hasPendingChanges(db)).toBe(false);
  });

  test("deleting an uploaded habit is pending: the account still has it", async () => {
    await addFullHabit("water");
    await markAllSynced();

    await deleteHabit(db, "water");

    expect(await hasPendingChanges(db)).toBe(true);
  });

  test("a habit created and deleted before being uploaded is not pending", async () => {
    await addFullHabit("water");

    await deleteHabit(db, "water");

    expect(await hasPendingChanges(db)).toBe(false);
  });
});

describe("deleteAccountData", () => {
  test("leaves no row in any table of the database", async () => {
    await addFullHabit("water");
    await addFullHabit("read");
    await addFullWeeklyGoal("run");
    await addFullLongTermGoal("books");
    await markSynced(db, "habits");
    await deleteHabit(db, "read");
    await db.run(
      "INSERT INTO sync_cursors VALUES ('habits', '2026-11-11T10:00:00Z', 'water')",
    );
    await db.run("INSERT INTO sync_account VALUES (1, 'user-1')");

    await deleteAccountData(db);

    // Every table, not only the known ones: a new table of the account must be emptied too.
    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    expect(tables.map((table) => table.name).sort()).toEqual(
      [...TABLES, "sync_account", "sync_cursors"].sort(),
    );
    for (const { name } of tables) {
      const count = await db.first<{ rows: number }>(
        `SELECT COUNT(*) AS rows FROM ${name}`,
      );
      expect({ table: name, rows: count?.rows }).toEqual({
        table: name,
        rows: 0,
      });
    }
  });

  test("an empty device stays empty", async () => {
    await deleteAccountData(db);

    expect(await hasPendingChanges(db)).toBe(false);
  });
});
