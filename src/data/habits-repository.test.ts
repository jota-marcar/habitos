import { localDate } from "@/domain/dates";
import { scheduledDaysFrom } from "@/domain/schedule";

import {
  addHabit,
  deleteHabit,
  listHabitVersions,
  listHabits,
  saveHabit,
  saveHabitVersion,
} from "./habits-repository";
import {
  habit,
  markSynced,
  openMigratedDatabase,
  syncState,
  version,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

describe("saveHabit and listHabits", () => {
  test("a saved habit is read back the same", async () => {
    const read = habit("read", {
      name: "Leer",
      type: "quantitative",
      archivedOn: localDate("2026-11-20"),
    });

    await saveHabit(db, read);

    expect(await listHabits(db)).toEqual([read]);
  });

  test("lists from the oldest to the newest, and by insertion on the same day", async () => {
    await saveHabit(db, habit("c", { createdOn: localDate("2026-11-05") }));
    await saveHabit(db, habit("b", { createdOn: localDate("2026-11-02") }));
    await saveHabit(db, habit("a", { createdOn: localDate("2026-11-05") }));

    expect((await listHabits(db)).map((h) => h.id)).toEqual(["b", "c", "a"]);
  });

  test("saving an existing habit updates its name and its archive date", async () => {
    await saveHabit(db, habit("read"));

    await saveHabit(
      db,
      habit("read", { name: "Leer", archivedOn: localDate("2026-11-20") }),
    );

    expect(await listHabits(db)).toEqual([
      habit("read", { name: "Leer", archivedOn: localDate("2026-11-20") }),
    ]);
  });

  test("an update marks the habit as pending synchronization again", async () => {
    await saveHabit(db, habit("read"));
    await markSynced(db, "habits");

    await saveHabit(db, habit("read", { name: "Leer" }));

    expect(await syncState(db, "habits")).toEqual([
      {
        id: "read",
        deleted: 0,
        pending_sync: 1,
        updated_at: "2026-11-11T10:00:00Z",
      },
    ]);
  });
});

describe("saveHabitVersion and listHabitVersions", () => {
  beforeEach(async () => {
    await saveHabit(db, habit("water", { type: "quantitative" }));
  });

  test("a saved version is read back the same", async () => {
    const first = version("water", {
      scheduledDays: scheduledDaysFrom([0, 2, 4]),
      target: 2,
      unit: "L",
      increment: 0.25,
    });

    await saveHabitVersion(db, first);

    expect(await listHabitVersions(db)).toEqual([first]);
  });

  test("keeps the nulls of a boolean habit", async () => {
    await saveHabit(db, habit("read"));
    await saveHabitVersion(db, version("read"));

    expect(await listHabitVersions(db)).toEqual([version("read")]);
  });

  test("lists the versions of each habit from the oldest to the newest", async () => {
    const newer = version("water", {
      id: "water-v2",
      effectiveFrom: localDate("2026-11-10"),
    });
    await saveHabitVersion(db, newer);
    await saveHabitVersion(db, version("water"));

    expect((await listHabitVersions(db)).map((v) => v.id)).toEqual([
      "water-v1",
      "water-v2",
    ]);
  });

  test("saving an existing version updates its configuration", async () => {
    await saveHabitVersion(db, version("water", { target: 2, unit: "L" }));
    await markSynced(db, "habit_versions");
    const changed = version("water", {
      scheduledDays: scheduledDaysFrom([5, 6]),
      target: 3,
      unit: "l",
      increment: 0.5,
    });

    await saveHabitVersion(db, changed);

    expect(await listHabitVersions(db)).toEqual([changed]);
    expect((await syncState(db, "habit_versions"))[0].pending_sync).toBe(1);
  });

  test("a habit cannot have two versions effective from the same day", async () => {
    await saveHabitVersion(db, version("water"));

    await expect(
      saveHabitVersion(db, version("water", { id: "water-v2" })),
    ).rejects.toThrow();
  });
});

describe("addHabit", () => {
  test("saves the habit and its first version", async () => {
    await addHabit(db, habit("read"), version("read"));

    expect(await listHabits(db)).toEqual([habit("read")]);
    expect(await listHabitVersions(db)).toEqual([version("read")]);
  });

  test("saves neither if the version is rejected", async () => {
    const invalid = version("read", { scheduledDays: 0 });

    await expect(addHabit(db, habit("read"), invalid)).rejects.toThrow();

    expect(await listHabits(db)).toEqual([]);
    expect(await listHabitVersions(db)).toEqual([]);
  });
});

describe("deleteHabit", () => {
  beforeEach(async () => {
    await addHabit(db, habit("read"), version("read"));
    await addHabit(db, habit("water"), version("water"));
    for (const id of ["read", "water"]) {
      await db.run(
        "INSERT INTO entries (id, habit_id, date, value) VALUES (?, ?, '2026-11-09', 1)",
        [`${id}-e`, id],
      );
      await db.run(
        "INSERT INTO reminders (id, habit_id, time) VALUES (?, ?, '08:00')",
        [`${id}-r`, id],
      );
    }
    for (const table of ["habits", "habit_versions", "entries", "reminders"]) {
      await markSynced(db, table);
    }
  });

  test("the habit and its versions stop being listed; the others stay", async () => {
    await deleteHabit(db, "read");

    expect(await listHabits(db)).toEqual([habit("water")]);
    expect(await listHabitVersions(db)).toEqual([version("water")]);
  });

  test.each(["habits", "habit_versions", "entries", "reminders"])(
    "marks the rows of the habit in %s as deleted and pending, and only those",
    async (table) => {
      await deleteHabit(db, "read");

      const state = await syncState(db, table);
      expect(state.map((row) => [row.deleted, row.pending_sync])).toEqual([
        [1, 1],
        [0, 0],
      ]);
    },
  );

  test("deleting a habit that does not exist changes nothing", async () => {
    await deleteHabit(db, "missing");

    expect((await listHabits(db)).map((h) => h.id)).toEqual(["read", "water"]);
  });
});
