import type { Reminder } from "@/domain/reminders";
import { localTime } from "@/domain/times";

import { saveHabit } from "./habits-repository";
import {
  addReminder,
  deleteReminder,
  listReminders,
} from "./reminders-repository";
import {
  habit,
  markSynced,
  openMigratedDatabase,
  syncState,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

let db: TestDatabase;

function reminder(habitId: string, time: string): Reminder {
  return { id: `${habitId}@${time}`, habitId, time: localTime(time) };
}

beforeEach(async () => {
  db = await openMigratedDatabase();
  await saveHabit(db, habit("water"));
  await saveHabit(db, habit("read"));
});

afterEach(() => {
  db.close();
});

describe("addReminder and listReminders", () => {
  test("a saved reminder is read back the same", async () => {
    await addReminder(db, reminder("water", "08:30"));

    expect(await listReminders(db)).toEqual([reminder("water", "08:30")]);
  });

  test("lists from the earliest time to the latest, and by insertion at the same time", async () => {
    await addReminder(db, reminder("water", "21:00"));
    await addReminder(db, reminder("read", "08:00"));
    await addReminder(db, reminder("water", "08:00"));

    expect((await listReminders(db)).map((r) => r.id)).toEqual([
      "read@08:00",
      "water@08:00",
      "water@21:00",
    ]);
  });

  test("rejects a second reminder of the same habit at the same time", async () => {
    await addReminder(db, reminder("water", "08:00"));

    await expect(
      addReminder(db, { ...reminder("water", "08:00"), id: "other" }),
    ).rejects.toThrow();
  });
});

describe("deleteReminder", () => {
  test("the reminder stops being listed and is marked to propagate the deletion", async () => {
    await addReminder(db, reminder("water", "08:00"));
    await addReminder(db, reminder("water", "21:00"));
    await markSynced(db, "reminders");

    await deleteReminder(db, "water@08:00");

    expect(await listReminders(db)).toEqual([reminder("water", "21:00")]);
    const state = await syncState(db, "reminders");
    expect(state.map((row) => [row.id, row.deleted, row.pending_sync])).toEqual(
      [
        ["water@08:00", 1, 1],
        ["water@21:00", 0, 0],
      ],
    );
  });

  test("a deleted time can be added again", async () => {
    await addReminder(db, reminder("water", "08:00"));
    await deleteReminder(db, "water@08:00");
    const again = { ...reminder("water", "08:00"), id: "new" };

    await addReminder(db, again);

    expect(await listReminders(db)).toEqual([again]);
  });

  test("deleting a reminder that does not exist changes nothing", async () => {
    await addReminder(db, reminder("water", "08:00"));

    await deleteReminder(db, "missing");

    expect(await listReminders(db)).toHaveLength(1);
  });
});
