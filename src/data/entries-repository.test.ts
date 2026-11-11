import { localDate } from "@/domain/dates";
import type { Entry } from "@/domain/entries";

import { listEntries, saveEntry } from "./entries-repository";
import { saveHabit } from "./habits-repository";
import {
  habit,
  markSynced,
  openMigratedDatabase,
  syncState,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

let db: TestDatabase;

const FROM = localDate("2026-11-01");
const TO = localDate("2026-11-30");

function entry(habitId: string, date: string, value: number): Entry {
  return {
    id: `${habitId}/${date}`,
    habitId,
    date: localDate(date),
    value,
  };
}

beforeEach(async () => {
  db = await openMigratedDatabase();
  await saveHabit(db, habit("water"));
  await saveHabit(db, habit("read"));
});

afterEach(() => {
  db.close();
});

describe("saveEntry and listEntries", () => {
  test("a saved entry is read back the same, decimals included", async () => {
    const saved = entry("water", "2026-11-09", 1.25);

    await saveEntry(db, saved);

    expect(await listEntries(db, FROM, TO)).toEqual([saved]);
  });

  test("lists the entries of the range, both ends included, by date", async () => {
    await saveEntry(db, entry("water", "2026-11-11", 3));
    await saveEntry(db, entry("water", "2026-11-09", 1));
    await saveEntry(db, entry("read", "2026-11-10", 1));
    await saveEntry(db, entry("water", "2026-11-08", 9));
    await saveEntry(db, entry("water", "2026-11-12", 9));

    const entries = await listEntries(
      db,
      localDate("2026-11-09"),
      localDate("2026-11-11"),
    );

    expect(entries.map((e) => e.id)).toEqual([
      "water/2026-11-09",
      "read/2026-11-10",
      "water/2026-11-11",
    ]);
  });

  test("a second entry for the same habit and day replaces the value and keeps the identifier", async () => {
    await saveEntry(db, entry("water", "2026-11-09", 1));

    await saveEntry(db, { ...entry("water", "2026-11-09", 1.5), id: "other" });

    expect(await listEntries(db, FROM, TO)).toEqual([
      entry("water", "2026-11-09", 1.5),
    ]);
  });

  test("replacing the value marks the entry as pending synchronization again", async () => {
    await saveEntry(db, entry("water", "2026-11-09", 1));
    await markSynced(db, "entries");

    await saveEntry(db, entry("water", "2026-11-09", 2));

    expect((await syncState(db, "entries"))[0].pending_sync).toBe(1);
  });

  test("the same day can have entries of different habits", async () => {
    await saveEntry(db, entry("water", "2026-11-09", 2));
    await saveEntry(db, entry("read", "2026-11-09", 1));

    expect(await listEntries(db, FROM, TO)).toHaveLength(2);
  });

  test("an entry with value 0 is kept: it tells the server that the habit was unmarked", async () => {
    await saveEntry(db, entry("read", "2026-11-09", 1));

    await saveEntry(db, entry("read", "2026-11-09", 0));

    expect(await listEntries(db, FROM, TO)).toEqual([
      entry("read", "2026-11-09", 0),
    ]);
  });

  test("deleted entries are not listed", async () => {
    await saveEntry(db, entry("water", "2026-11-09", 1));
    await db.run("UPDATE entries SET deleted = 1");

    expect(await listEntries(db, FROM, TO)).toEqual([]);
  });
});
