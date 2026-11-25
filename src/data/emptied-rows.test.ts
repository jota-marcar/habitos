import { EMPTIED_VALUES } from "./emptied-rows";
import { saveEntry } from "./entries-repository";
import { addHabit, deleteHabit } from "./habits-repository";
import { addReminder, deleteReminder } from "./reminders-repository";
import { SYNC_TABLES, syncedColumns } from "./sync-repository";
import {
  habit,
  longTermGoal,
  openMigratedDatabase,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";
import {
  deleteLongTermGoal,
  saveLongTermGoal,
  saveLongTermGoalEntry,
} from "./long-term-goals-repository";
import {
  addWeeklyGoal,
  deleteWeeklyGoal,
  saveWeeklyGoalEntry,
} from "./weekly-goals-repository";
import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

/** The row with its emptied columns only. */
async function emptiedColumns(table: keyof typeof EMPTIED_VALUES, id: string) {
  const columns = Object.keys(EMPTIED_VALUES[table]);
  return db.first<Record<string, unknown>>(
    `SELECT ${columns.join(", ")} FROM ${table} WHERE id = ?`,
    [id],
  );
}

describe("EMPTIED_VALUES", () => {
  test.each(SYNC_TABLES)(
    "%s only empties what it has, and never its keys",
    (table) => {
      const columns = Object.keys(EMPTIED_VALUES[table]);
      const synced = syncedColumns(table);

      expect(columns.filter((c) => !synced.includes(c))).toEqual([]);
      for (const kept of [
        "id",
        "deleted",
        "habit_id",
        "weekly_goal_id",
        "long_term_goal_id",
      ]) {
        expect(columns).not.toContain(kept);
      }
    },
  );

  test.each(SYNC_TABLES)(
    "%s leaves no column with data of the user",
    (table) => {
      const structural = [
        "id",
        "deleted",
        "habit_id",
        "weekly_goal_id",
        "long_term_goal_id",
        "recurring",
      ];
      const left = syncedColumns(table).filter(
        (column) =>
          !structural.includes(column) && !(column in EMPTIED_VALUES[table]),
      );

      expect(left).toEqual([]);
    },
  );
});

describe("deleting empties the rows (RF-11, RF-45)", () => {
  test("a habit and everything that hangs from it", async () => {
    await addHabit(
      db,
      habit("h", { name: "Secret", type: "quantitative", color: "blue" }),
      version("h", { id: "v", target: 2, unit: "L", increment: 0.5 }),
      [{ id: "r", habitId: "h", time: localTime("08:30") }],
    );
    await saveEntry(db, {
      id: "e",
      habitId: "h",
      date: localDate("2026-11-09"),
      value: 1.5,
    });

    await deleteHabit(db, "h");

    expect(await emptiedColumns("habits", "h")).toEqual(EMPTIED_VALUES.habits);
    expect(await emptiedColumns("habit_versions", "v")).toEqual(
      EMPTIED_VALUES.habit_versions,
    );
    expect(await emptiedColumns("entries", "e")).toEqual(
      EMPTIED_VALUES.entries,
    );
    expect(await emptiedColumns("reminders", "r")).toEqual(
      EMPTIED_VALUES.reminders,
    );
  });

  test("a goal and everything that hangs from it", async () => {
    const week = localDate("2026-11-16");
    await addWeeklyGoal(
      db,
      weeklyGoal("g", { name: "Secret", type: "quantitative", color: "blue" }),
      weeklyGoalVersion("g", { id: "v", target: 5, unit: "h", increment: 1 }),
    );
    await saveWeeklyGoalEntry(db, {
      id: "e",
      weeklyGoalId: "g",
      week,
      value: 3,
    });

    await deleteWeeklyGoal(db, "g");

    expect(await emptiedColumns("weekly_goals", "g")).toEqual(
      EMPTIED_VALUES.weekly_goals,
    );
    expect(await emptiedColumns("weekly_goal_versions", "v")).toEqual(
      EMPTIED_VALUES.weekly_goal_versions,
    );
    expect(await emptiedColumns("weekly_goal_entries", "e")).toEqual(
      EMPTIED_VALUES.weekly_goal_entries,
    );
  });

  test("a long-term goal and its total (RF-57)", async () => {
    await saveLongTermGoal(
      db,
      longTermGoal("g", {
        name: "Secret",
        type: "quantitative",
        color: "blue",
        target: 24,
        unit: "libros",
        increment: 1,
      }),
    );
    await saveLongTermGoalEntry(db, { id: "e", longTermGoalId: "g", value: 3 });

    await deleteLongTermGoal(db, "g");

    expect(await emptiedColumns("long_term_goals", "g")).toEqual(
      EMPTIED_VALUES.long_term_goals,
    );
    expect(await emptiedColumns("long_term_goal_entries", "e")).toEqual(
      EMPTIED_VALUES.long_term_goal_entries,
    );
  });

  test("a reminder removed on its own", async () => {
    await addHabit(db, habit("h"), version("h"));
    await addReminder(db, {
      id: "r",
      habitId: "h",
      time: localTime("08:30"),
    });

    await deleteReminder(db, "r");

    expect(await emptiedColumns("reminders", "r")).toEqual(
      EMPTIED_VALUES.reminders,
    );
  });

  test("several deleted rows can share the emptied values", async () => {
    await addHabit(db, habit("h"), version("h"), [
      { id: "r1", habitId: "h", time: localTime("08:00") },
      { id: "r2", habitId: "h", time: localTime("09:00") },
    ]);

    await deleteHabit(db, "h");

    const rows = await db.all("SELECT id FROM reminders WHERE time = '00:00'");
    expect(rows).toHaveLength(2);
  });
});
