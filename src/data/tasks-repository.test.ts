import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";

import { deleteTask, listTasks, saveTask } from "./tasks-repository";
import {
  markSynced,
  openMigratedDatabase,
  syncState,
  task,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

describe("tasks", () => {
  test("a saved task is read back as it was, in the order of creation", async () => {
    const water = task("b", {
      type: "quantitative",
      color: "teal",
      target: 2,
      unit: "L",
      increment: 0.25,
      value: 2,
      completedOn: localDate("2026-11-19"),
    });
    await saveTask(db, water);
    await saveTask(db, task("a"));

    expect(await listTasks(db)).toEqual([water, task("a")]);
  });

  test("a color this version does not know is read as none", async () => {
    await saveTask(db, task("a"));
    await db.run("UPDATE tasks SET color = 'future'");

    expect((await listTasks(db))[0].color).toBeNull();
  });

  test("saving again updates everything but the type", async () => {
    await saveTask(db, task("a"));
    await markSynced(db, "tasks");

    const changed = task("a", {
      name: "Otro",
      dueOn: localDate("2026-11-21"),
      dueTime: localTime("09:00"),
      value: 1,
      completedOn: localDate("2026-11-20"),
    });
    await saveTask(db, { ...changed, type: "quantitative" });

    expect(await listTasks(db)).toEqual([changed]);
    expect((await syncState(db, "tasks"))[0].pending_sync).toBe(1);
  });

  test("deleting only marks the row, to propagate it", async () => {
    await saveTask(db, task("a"));
    await markSynced(db, "tasks");

    await deleteTask(db, "a");

    expect(await listTasks(db)).toEqual([]);
    expect((await syncState(db, "tasks"))[0]).toMatchObject({
      deleted: 1,
      pending_sync: 1,
    });
  });
});
