import { localDate, type LocalDate } from "@/domain/dates";
import { localTime } from "@/domain/times";
import { EMPTIED_VALUES } from "@/data/emptied-rows";
import { listEntries, saveEntry } from "@/data/entries-repository";
import {
  addHabit,
  deleteHabit,
  listHabits,
  saveHabit,
} from "@/data/habits-repository";
import {
  addReminder,
  deleteReminder,
  listReminders,
} from "@/data/reminders-repository";
import {
  SYNC_TABLES,
  adoptSyncAccount,
  readCursor,
} from "@/data/sync-repository";
import {
  habit,
  openMigratedDatabase,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import {
  addWeeklyGoal,
  deleteWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoalVersions,
  listWeeklyGoals,
  saveWeeklyGoalEntry,
} from "@/data/weekly-goals-repository";

import { synchronize } from "./synchronize";
import { FakeRemote, UniqueViolation } from "./testing/fake-remote";

const USER = "user-1";
const DAY = localDate("2026-11-12");
const NEXT_DAY = localDate("2026-11-13");

let remote: FakeRemote;
let phone: TestDatabase;
let tablet: TestDatabase;

beforeEach(async () => {
  remote = new FakeRemote();
  phone = await openMigratedDatabase();
  tablet = await openMigratedDatabase();
});

afterEach(() => {
  phone.close();
  tablet.close();
});

/** A habit with a row in every synchronized table. */
async function addFullHabit(db: TestDatabase, id: string): Promise<void> {
  await addHabit(db, habit(id), version(id), [
    { id: `${id}-reminder`, habitId: id, time: localTime("08:00") },
  ]);
  await saveEntry(db, { id: `${id}-entry`, habitId: id, date: DAY, value: 1 });
}

async function pendingCount(db: TestDatabase): Promise<number> {
  let count = 0;
  for (const table of SYNC_TABLES) {
    const row = await db.first<{ rows: number }>(
      `SELECT COUNT(*) AS rows FROM ${table} WHERE pending_sync = 1`,
    );
    count += row?.rows ?? 0;
  }
  return count;
}

async function habitNames(db: TestDatabase): Promise<string[]> {
  return (await listHabits(db)).map((h) => h.name).sort();
}

async function entriesOf(db: TestDatabase, day: LocalDate) {
  return (await listEntries(db, day, day)).map(({ id, value }) => ({
    id,
    value,
  }));
}

describe("synchronize weekly goals", () => {
  const WEEK = localDate("2026-11-16");

  test("another device finds the goal, its version and its total", async () => {
    const goal = weeklyGoal("run", { recurring: false, color: "teal" });
    await addWeeklyGoal(phone, goal, weeklyGoalVersion("run"));
    await saveWeeklyGoalEntry(phone, {
      id: "run-entry",
      weeklyGoalId: "run",
      week: WEEK,
      value: 2,
    });

    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);

    expect(remote.row("weekly_goals", "run")).toMatchObject({
      recurring: false,
    });
    expect(await listWeeklyGoals(tablet)).toEqual([goal]);
    expect(await listWeeklyGoalVersions(tablet)).toHaveLength(1);
    expect(await listWeeklyGoalEntries(tablet, WEEK)).toMatchObject([
      { id: "run-entry", value: 2 },
    ]);
    expect(await pendingCount(phone)).toBe(0);
    expect(await pendingCount(tablet)).toBe(0);
  });

  test("a recurring goal arrives as recurring", async () => {
    await addWeeklyGoal(phone, weeklyGoal("run"), weeklyGoalVersion("run"));

    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);

    expect((await listWeeklyGoals(tablet))[0].recurring).toBe(true);
  });

  test("the total of the same week on two devices is joined by its key", async () => {
    await addWeeklyGoal(phone, weeklyGoal("run"), weeklyGoalVersion("run"));
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await saveWeeklyGoalEntry(phone, {
      id: "phone-entry",
      weeklyGoalId: "run",
      week: WEEK,
      value: 1,
    });
    await saveWeeklyGoalEntry(tablet, {
      id: "tablet-entry",
      weeklyGoalId: "run",
      week: WEEK,
      value: 3,
    });

    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await synchronize(phone, remote, USER);

    expect(remote.rows.weekly_goal_entries.size).toBe(1);
    expect(await listWeeklyGoalEntries(phone, WEEK)).toEqual(
      await listWeeklyGoalEntries(tablet, WEEK),
    );
  });

  test("a deleted goal disappears from the other devices", async () => {
    await addWeeklyGoal(phone, weeklyGoal("run"), weeklyGoalVersion("run"));
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);

    await deleteWeeklyGoal(phone, "run");
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);

    expect(await listWeeklyGoals(tablet)).toEqual([]);
  });
});

describe("synchronize", () => {
  test.each([
    ["before", "a-new"],
    ["after", "z-new"],
  ])(
    "uploads a reminder set again at the same time, with its id %s the old one",
    async (_order, added) => {
      const time = localTime("08:00");
      await addHabit(phone, habit("water"), version("water"), [
        { id: "m-old", habitId: "water", time },
      ]);
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      await deleteReminder(phone, "m-old");
      await addReminder(phone, { id: added, habitId: "water", time });
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      expect(await listReminders(tablet)).toEqual([
        { id: added, habitId: "water", time },
      ]);
    },
  );

  test("uploads every local row on the first synchronization (RF-38)", async () => {
    await addFullHabit(phone, "water");

    await synchronize(phone, remote, USER);

    expect(remote.row("habits", "water")).toMatchObject({ deleted: false });
    expect(remote.rows.habit_versions.size).toBe(1);
    expect(remote.row("entries", "water-entry")).toMatchObject({ value: 1 });
    expect(remote.row("reminders", "water-reminder")).toMatchObject({
      time: "08:00",
    });
    expect(await pendingCount(phone)).toBe(0);
  });

  test("another device finds every habit and its history (RF-05)", async () => {
    await addFullHabit(phone, "water");
    await synchronize(phone, remote, USER);

    const result = await synchronize(tablet, remote, USER);

    expect(result.changed).toBe(true);
    expect(await habitNames(tablet)).toEqual(["water"]);
    expect(await entriesOf(tablet, DAY)).toEqual([
      { id: "water-entry", value: 1 },
    ]);
    expect(await listReminders(tablet)).toHaveLength(1);
    expect(await pendingCount(tablet)).toBe(0);
  });

  test("joins the habits of the device with those of the account (RF-38)", async () => {
    await addFullHabit(phone, "water");
    await addFullHabit(tablet, "read");

    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await synchronize(phone, remote, USER);

    expect(await habitNames(phone)).toEqual(["read", "water"]);
    expect(await habitNames(tablet)).toEqual(["read", "water"]);
  });

  test("changes and deletions reach the other devices", async () => {
    await addFullHabit(phone, "water");
    await addFullHabit(phone, "read");
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);

    await saveHabit(tablet, habit("water", { name: "Drink water" }));
    await deleteHabit(tablet, "read");
    await synchronize(tablet, remote, USER);
    await synchronize(phone, remote, USER);

    expect(await habitNames(phone)).toEqual(["Drink water"]);
    expect(await listReminders(phone)).toHaveLength(1);
    expect(remote.row("entries", "read-entry")).toMatchObject({
      deleted: true,
    });
  });

  test("nothing changes on the device when the account has nothing new", async () => {
    await addFullHabit(phone, "water");
    await synchronize(phone, remote, USER);

    // The rows just uploaded come back, but they are already on the device.
    expect(await synchronize(phone, remote, USER)).toEqual({ changed: false });
  });

  test("an entry of the same day on two devices without connection is joined", async () => {
    await addFullHabit(phone, "water");
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await saveEntry(phone, {
      id: "p",
      habitId: "water",
      date: NEXT_DAY,
      value: 1,
    });
    await saveEntry(tablet, {
      id: "t",
      habitId: "water",
      date: NEXT_DAY,
      value: 2,
    });

    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await synchronize(phone, remote, USER);

    // The tablet uploaded last: its value stays, under the id the account already had.
    expect(await entriesOf(phone, NEXT_DAY)).toEqual([{ id: "p", value: 2 }]);
    expect(await entriesOf(tablet, NEXT_DAY)).toEqual([{ id: "p", value: 2 }]);
    expect(await pendingCount(tablet)).toBe(0);
  });

  test("downloads in pages, also of rows that share the time of the server", async () => {
    for (const id of ["a", "b", "c", "d", "e"]) await addFullHabit(phone, id);
    await synchronize(phone, remote, USER, 2);

    await synchronize(tablet, remote, USER, 2);

    expect(await habitNames(tablet)).toEqual(["a", "b", "c", "d", "e"]);
    expect(await listReminders(tablet)).toHaveLength(5);
  });

  test("removes the data of another account before synchronizing", async () => {
    await adoptSyncAccount(phone, "another-user");
    await addFullHabit(phone, "water");

    const result = await synchronize(phone, remote, USER);

    expect(result.changed).toBe(true);
    expect(await habitNames(phone)).toEqual([]);
    expect(remote.rows.habits.size).toBe(0);
  });

  test("a page that fails half way leaves nothing behind, and its cursor stays", async () => {
    const updated_at = "2026-11-12T10:00:00.000Z";
    jest.spyOn(remote, "pull").mockResolvedValueOnce([
      {
        id: "whole",
        name: "Whole",
        type: "boolean",
        color: null,
        created_on: DAY,
        archived_on: null,
        deleted: false,
        updated_at,
      },
      { id: "broken", updated_at },
    ]);

    await expect(synchronize(phone, remote, USER)).rejects.toThrow("broken");

    expect(await habitNames(phone)).toEqual([]);
    expect(await readCursor(phone, "habits")).toBeNull();
  });

  describe("a deletion is for good (ADR-0023)", () => {
    test("the account keeps nothing of a deleted habit", async () => {
      await addFullHabit(phone, "water");
      await synchronize(phone, remote, USER);

      await deleteHabit(phone, "water");
      await synchronize(phone, remote, USER);

      expect(remote.row("habits", "water")).toMatchObject({
        deleted: true,
        ...EMPTIED_VALUES.habits,
      });
      expect(remote.row("entries", "water-entry")).toMatchObject({
        deleted: true,
        ...EMPTIED_VALUES.entries,
      });
      expect(await pendingCount(phone)).toBe(0);
    });

    test("the other devices empty their copy too", async () => {
      await addFullHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      await deleteHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      expect(
        await tablet.first(
          "SELECT name, deleted FROM habits WHERE id = 'water'",
        ),
      ).toEqual({ name: "", deleted: 1 });
      expect(
        await tablet.first(
          "SELECT value FROM entries WHERE id = 'water-entry'",
        ),
      ).toEqual({ value: 0 });
    });

    test("an older change on another device does not bring it back", async () => {
      await addFullHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      await deleteHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await saveHabit(tablet, habit("water", { name: "Changed offline" }));
      await synchronize(tablet, remote, USER);
      await synchronize(tablet, remote, USER);

      expect(remote.row("habits", "water")).toMatchObject({
        deleted: true,
        name: "",
      });
      expect(await habitNames(tablet)).toEqual([]);
      expect(await pendingCount(tablet)).toBe(0);
    });

    test("a new entry of a habit deleted elsewhere ends up deleted", async () => {
      await addFullHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await synchronize(tablet, remote, USER);

      await deleteHabit(phone, "water");
      await synchronize(phone, remote, USER);
      await saveEntry(tablet, {
        id: "offline-entry",
        habitId: "water",
        date: NEXT_DAY,
        value: 3,
      });
      await synchronize(tablet, remote, USER);

      expect(remote.row("entries", "offline-entry")).toMatchObject({
        deleted: true,
        ...EMPTIED_VALUES.entries,
      });
    });

    test("a deleted reminder can be set again at the same time", async () => {
      await addFullHabit(phone, "water");
      await synchronize(phone, remote, USER);

      await deleteReminder(phone, "water-reminder");
      await addReminder(phone, {
        id: "water-reminder-2",
        habitId: "water",
        time: localTime("08:00"),
      });
      await synchronize(phone, remote, USER);

      expect(remote.row("reminders", "water-reminder")).toMatchObject({
        deleted: true,
        time: "00:00",
      });
      expect(remote.row("reminders", "water-reminder-2")).toMatchObject({
        deleted: false,
        time: "08:00",
      });
    });
  });

  test("a failed upload is retried on the next synchronization", async () => {
    await addFullHabit(phone, "water");
    remote.beforePush = async () => {
      throw new Error("offline");
    };

    await expect(synchronize(phone, remote, USER)).rejects.toThrow("offline");
    expect(await pendingCount(phone)).toBe(4);

    remote.beforePush = async () => {};
    await synchronize(phone, remote, USER);
    expect(await pendingCount(phone)).toBe(0);
  });

  test("a change made while uploading is uploaded next time", async () => {
    await addFullHabit(phone, "water");
    remote.beforePush = async (table) => {
      if (table === "habits") {
        await saveHabit(phone, habit("water", { name: "Drink water" }));
      }
    };

    await synchronize(phone, remote, USER);
    expect(remote.row("habits", "water")).toMatchObject({ name: "water" });

    remote.beforePush = async () => {};
    await synchronize(phone, remote, USER);
    expect(remote.row("habits", "water")).toMatchObject({
      name: "Drink water",
    });
  });

  test("a row of a habit created meanwhile is downloaded on the next synchronization", async () => {
    await synchronize(phone, remote, USER);
    // Another device uploads a habit with its entry after the phone downloaded the habits.
    let tabletSynchronized = false;
    remote.beforePull = async (table) => {
      if (table === "entries" && !tabletSynchronized) {
        tabletSynchronized = true;
        await addFullHabit(tablet, "water");
        await synchronize(tablet, remote, USER);
      }
    };

    await expect(synchronize(phone, remote, USER)).rejects.toThrow();

    await synchronize(phone, remote, USER);
    expect(await habitNames(phone)).toEqual(["water"]);
    expect(await entriesOf(phone, DAY)).toEqual([
      { id: "water-entry", value: 1 },
    ]);
  });

  test("a clash in the account fails the synchronization, and the next one joins the rows", async () => {
    await addFullHabit(phone, "water");
    await synchronize(phone, remote, USER);
    await synchronize(tablet, remote, USER);
    await saveEntry(phone, {
      id: "p",
      habitId: "water",
      date: NEXT_DAY,
      value: 1,
    });
    await saveEntry(tablet, {
      id: "t",
      habitId: "water",
      date: NEXT_DAY,
      value: 2,
    });
    // The phone uploads its entry after the tablet has downloaded and before it uploads.
    remote.beforePush = async (table) => {
      if (table === "entries") {
        remote.beforePush = async () => {};
        await synchronize(phone, remote, USER);
      }
    };

    await expect(synchronize(tablet, remote, USER)).rejects.toBeInstanceOf(
      UniqueViolation,
    );

    await synchronize(tablet, remote, USER);
    await synchronize(phone, remote, USER);
    expect(await entriesOf(phone, NEXT_DAY)).toEqual([{ id: "p", value: 2 }]);
    expect(await entriesOf(tablet, NEXT_DAY)).toEqual([{ id: "p", value: 2 }]);
  });

  test("a row the account did not confirm stays pending", async () => {
    await saveHabit(phone, habit("water"));
    remote.push = async () => [];

    await synchronize(phone, remote, USER);

    expect(await pendingCount(phone)).toBe(1);
  });
});
