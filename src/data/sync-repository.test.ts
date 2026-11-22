import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";

import { saveEntry } from "./entries-repository";
import { addHabit, deleteHabit, saveHabit } from "./habits-repository";
import { addReminder } from "./reminders-repository";
import {
  SYNC_TABLES,
  adoptSyncAccount,
  applyPulledRows,
  markUploaded,
  pendingRows,
  readCursor,
  readSyncAccount,
  saveCursor,
  syncedColumns,
  type PulledRow,
} from "./sync-repository";
import {
  habit,
  markSynced,
  openMigratedDatabase,
  syncState,
  version,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

const T1 = "2026-11-18T10:00:00.000001+00:00";
const T2 = "2026-11-18T10:00:00.000002+00:00";

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

/** A habit as the cloud sends it. */
function cloudHabit(id: string, overrides: Partial<PulledRow> = {}): PulledRow {
  return {
    id,
    name: id,
    type: "boolean",
    color: null,
    created_on: "2026-11-01",
    archived_on: null,
    deleted: false,
    updated_at: T1,
    ...overrides,
  };
}

/** An entry as the cloud sends it. */
function cloudEntry(
  id: string,
  habitId: string,
  overrides: Partial<PulledRow> = {},
): PulledRow {
  return {
    id,
    habit_id: habitId,
    date: "2026-11-12",
    value: 1,
    deleted: false,
    updated_at: T1,
    ...overrides,
  };
}

async function entryRows() {
  return db.all(
    "SELECT id, value, deleted, pending_sync FROM entries ORDER BY id",
  );
}

describe("syncedColumns", () => {
  test.each(SYNC_TABLES)(
    "are every column of %s but those of the synchronization",
    async (table) => {
      const columns = await db.all<{ name: string }>(
        `PRAGMA table_info(${table})`,
      );
      const expected = columns
        .map((column) => column.name)
        .filter((name) => !["updated_at", "pending_sync"].includes(name));

      expect([...syncedColumns(table)].sort()).toEqual(expected.sort());
    },
  );
});

describe("pendingRows", () => {
  test("returns the rows with changes, in the format of the cloud", async () => {
    await addHabit(db, habit("water", { color: "teal" }), version("water"));

    expect(await pendingRows(db, "habits", false, "", 10)).toEqual([
      {
        id: "water",
        name: "water",
        type: "boolean",
        color: "teal",
        created_on: "2026-11-01",
        archived_on: null,
        deleted: false,
      },
    ]);
  });

  test("gives the deleted rows apart and leaves out those already uploaded", async () => {
    await addHabit(db, habit("read"), version("read"));
    await addHabit(db, habit("water"), version("water"));
    await markSynced(db, "habits");
    await deleteHabit(db, "water");
    await saveHabit(db, habit("run"));

    const removed = await pendingRows(db, "habits", true, "", 10);
    const live = await pendingRows(db, "habits", false, "", 10);

    expect(removed.map((row) => [row.id, row.deleted])).toEqual([
      ["water", true],
    ]);
    expect(live.map((row) => [row.id, row.deleted])).toEqual([["run", false]]);
  });

  test("goes in pages of ids", async () => {
    for (const id of ["a", "b", "c"]) await saveHabit(db, habit(id));

    const first = await pendingRows(db, "habits", false, "", 2);
    const second = await pendingRows(db, "habits", false, "b", 2);

    expect(first.map((row) => row.id)).toEqual(["a", "b"]);
    expect(second.map((row) => row.id)).toEqual(["c"]);
  });
});

describe("markUploaded", () => {
  test("the row is no longer pending and keeps the time of the server", async () => {
    await saveHabit(db, habit("water"));
    const [row] = await pendingRows(db, "habits", false, "", 10);

    await markUploaded(db, "habits", row, T1);

    expect(await syncState(db, "habits")).toEqual([
      { id: "water", deleted: 0, pending_sync: 0, updated_at: T1 },
    ]);
  });

  test("a row changed while it was uploading stays pending", async () => {
    await saveHabit(db, habit("water"));
    const [row] = await pendingRows(db, "habits", false, "", 10);
    await saveHabit(db, habit("water", { name: "Drink water" }));

    await markUploaded(db, "habits", row, T1);

    // It has reached the account, but not its last change.
    expect(await syncState(db, "habits")).toEqual([
      { id: "water", deleted: 0, pending_sync: 1, updated_at: T1 },
    ]);
  });

  test("a row deleted while it was uploading stays pending", async () => {
    await addHabit(db, habit("water"), version("water"));
    const [row] = await pendingRows(db, "habits", false, "", 10);
    await deleteHabit(db, "water");

    await markUploaded(db, "habits", row, T1);

    expect(await syncState(db, "habits")).toEqual([
      { id: "water", deleted: 1, pending_sync: 1, updated_at: T1 },
    ]);
  });

  test("throws for a row without one of the columns", async () => {
    await saveHabit(db, habit("water"));

    await expect(
      markUploaded(db, "habits", { id: "water", name: "water" }, T1),
    ).rejects.toThrow("The row water has no column type.");
  });
});

describe("applyPulledRows", () => {
  test("adds a new row as already synchronized", async () => {
    const changed = await applyPulledRows(db, "habits", [
      cloudHabit("water", { color: "teal" }),
    ]);

    expect(changed).toBe(1);
    expect(
      await db.all("SELECT id, name, color, created_on FROM habits"),
    ).toEqual([
      { id: "water", name: "water", color: "teal", created_on: "2026-11-01" },
    ]);
    expect(await syncState(db, "habits")).toEqual([
      { id: "water", deleted: 0, pending_sync: 0, updated_at: T1 },
    ]);
  });

  test("updates a row without local changes", async () => {
    await applyPulledRows(db, "habits", [cloudHabit("water")]);

    const changed = await applyPulledRows(db, "habits", [
      cloudHabit("water", { name: "Drink water", updated_at: T2 }),
    ]);

    expect(changed).toBe(1);
    expect(await db.all("SELECT name, updated_at FROM habits")).toEqual([
      { name: "Drink water", updated_at: T2 },
    ]);
  });

  test("applying the same row again changes nothing", async () => {
    await applyPulledRows(db, "habits", [cloudHabit("water")]);

    expect(await applyPulledRows(db, "habits", [cloudHabit("water")])).toBe(0);
  });

  test("a row uploaded from this device comes back without changing anything", async () => {
    await saveHabit(db, habit("water"));
    const [row] = await pendingRows(db, "habits", false, "", 10);
    await markUploaded(db, "habits", row, T1);

    expect(await applyPulledRows(db, "habits", [cloudHabit("water")])).toBe(0);
  });

  test("keeps the local changes that have not been uploaded yet", async () => {
    await saveHabit(db, habit("water", { name: "Drink water" }));

    const changed = await applyPulledRows(db, "habits", [cloudHabit("water")]);

    expect(changed).toBe(0);
    expect(await db.all("SELECT name, pending_sync FROM habits")).toEqual([
      { name: "Drink water", pending_sync: 1 },
    ]);
  });

  test("applies deletions, also of rows the device never had", async () => {
    await applyPulledRows(db, "habits", [cloudHabit("water")]);

    await applyPulledRows(db, "habits", [
      cloudHabit("water", { deleted: true, updated_at: T2 }),
      cloudHabit("read", { deleted: true }),
    ]);

    expect(await syncState(db, "habits")).toEqual([
      { id: "read", deleted: 1, pending_sync: 0, updated_at: T1 },
      { id: "water", deleted: 1, pending_sync: 0, updated_at: T2 },
    ]);
  });

  test("rejects a row whose habit is not on the device", async () => {
    await expect(
      applyPulledRows(db, "entries", [cloudEntry("e1", "water")]),
    ).rejects.toThrow();
  });

  test("an entry created on both devices takes the id of the account and keeps the local value", async () => {
    await applyPulledRows(db, "habits", [cloudHabit("water")]);
    await saveEntry(db, {
      id: "local",
      habitId: "water",
      date: localDate("2026-11-12"),
      value: 3,
    });

    const changed = await applyPulledRows(db, "entries", [
      cloudEntry("cloud", "water", { value: 1 }),
    ]);

    // The local value is more recent: it stays pending, to update the row of the account.
    expect(changed).toBe(1);
    expect(await entryRows()).toEqual([
      { id: "cloud", value: 3, deleted: 0, pending_sync: 1 },
    ]);
  });

  test("a deleted row of the account does not take the place of a local one", async () => {
    await applyPulledRows(db, "habits", [cloudHabit("water")]);
    await saveEntry(db, {
      id: "local",
      habitId: "water",
      date: localDate("2026-11-12"),
      value: 3,
    });

    await applyPulledRows(db, "entries", [
      cloudEntry("cloud", "water", { deleted: true }),
    ]);

    expect(await entryRows()).toEqual([
      { id: "cloud", value: 1, deleted: 1, pending_sync: 0 },
      { id: "local", value: 3, deleted: 0, pending_sync: 1 },
    ]);
  });

  test("a row already on the device is not taken twice", async () => {
    // A reminder deleted on the device and added again at the same time, before uploading.
    await applyPulledRows(db, "habits", [cloudHabit("water")]);
    await applyPulledRows(db, "reminders", [
      {
        id: "old",
        habit_id: "water",
        time: "08:00",
        deleted: false,
        updated_at: T1,
      },
    ]);
    await db.run(
      "UPDATE reminders SET deleted = 1, pending_sync = 1 WHERE id = 'old'",
    );
    await addReminder(db, {
      id: "new",
      habitId: "water",
      time: localTime("08:00"),
    });

    // The old reminder comes back from another pull, before the deletion has been uploaded.
    const changed = await applyPulledRows(db, "reminders", [
      {
        id: "old",
        habit_id: "water",
        time: "08:00",
        deleted: false,
        updated_at: T1,
      },
    ]);

    expect(changed).toBe(0);
    expect(await syncState(db, "reminders")).toEqual([
      { id: "new", deleted: 0, pending_sync: 1, updated_at: null },
      { id: "old", deleted: 1, pending_sync: 1, updated_at: T1 },
    ]);
  });
});

describe("cursors", () => {
  test("a table that has never downloaded anything has none", async () => {
    expect(await readCursor(db, "habits")).toBeNull();
  });

  test("keep the last row downloaded of each table", async () => {
    await saveCursor(db, "habits", { updatedAt: T1, id: "a" });
    await saveCursor(db, "habits", { updatedAt: T2, id: "b" });
    await saveCursor(db, "entries", { updatedAt: T1, id: "c" });

    expect(await readCursor(db, "habits")).toEqual({ updatedAt: T2, id: "b" });
    expect(await readCursor(db, "entries")).toEqual({ updatedAt: T1, id: "c" });
  });
});

describe("adoptSyncAccount", () => {
  test("data that never synchronized become part of the account", async () => {
    await saveHabit(db, habit("water"));

    expect(await adoptSyncAccount(db, "user-1")).toBe(false);

    expect(await readSyncAccount(db)).toBe("user-1");
    expect(await pendingRows(db, "habits", false, "", 10)).toHaveLength(1);
  });

  test("the same account keeps its data", async () => {
    await adoptSyncAccount(db, "user-1");
    await saveHabit(db, habit("water"));

    expect(await adoptSyncAccount(db, "user-1")).toBe(false);

    expect(await pendingRows(db, "habits", false, "", 10)).toHaveLength(1);
  });

  test("the data of another account are removed first", async () => {
    await adoptSyncAccount(db, "user-1");
    await saveHabit(db, habit("water"));
    await saveCursor(db, "habits", { updatedAt: T1, id: "water" });

    expect(await adoptSyncAccount(db, "user-2")).toBe(true);

    expect(await readSyncAccount(db)).toBe("user-2");
    expect(await db.all("SELECT id FROM habits")).toEqual([]);
    expect(await readCursor(db, "habits")).toBeNull();
  });

  test("a device that never synchronized has no account", async () => {
    expect(await readSyncAccount(db)).toBeNull();
  });
});
