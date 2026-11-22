import { localDate } from "@/domain/dates";

import {
  markSynced,
  openMigratedDatabase,
  syncState,
  weeklyGoal,
  weeklyGoalVersion,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";
import {
  addWeeklyGoal,
  deleteWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoalVersions,
  listWeeklyGoals,
  saveWeeklyGoal,
  saveWeeklyGoalChanges,
  saveWeeklyGoalEntry,
  saveWeeklyGoalVersion,
} from "./weekly-goals-repository";

const MONDAY = localDate("2026-11-16");
const NEXT_MONDAY = localDate("2026-11-23");

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

function entry(goalId: string, value: number, week = MONDAY) {
  return {
    id: `${goalId}-${week}`,
    weeklyGoalId: goalId,
    week,
    value,
  };
}

describe("addWeeklyGoal", () => {
  test("saves the goal and its first version", async () => {
    const goal = weeklyGoal("run", { color: "teal", recurring: false });
    const version = weeklyGoalVersion("run", {
      target: 3,
      unit: "veces",
      increment: 1,
    });

    await addWeeklyGoal(db, goal, version);

    expect(await listWeeklyGoals(db)).toEqual([goal]);
    expect(await listWeeklyGoalVersions(db)).toEqual([version]);
  });

  test("saves neither if the version cannot be saved", async () => {
    const version = weeklyGoalVersion("run", {
      effectiveFrom: localDate("2026-11-17"),
    });

    await expect(
      addWeeklyGoal(db, weeklyGoal("run"), version),
    ).rejects.toThrow();

    expect(await listWeeklyGoals(db)).toEqual([]);
  });
});

describe("listWeeklyGoals", () => {
  test("goes from the oldest to the newest", async () => {
    await saveWeeklyGoal(db, weeklyGoal("later", { firstWeek: NEXT_MONDAY }));
    await saveWeeklyGoal(db, weeklyGoal("first"));
    await saveWeeklyGoal(db, weeklyGoal("second"));

    const goals = await listWeeklyGoals(db);

    expect(goals.map((goal) => goal.id)).toEqual(["first", "second", "later"]);
  });

  test("reads an archived goal and a color it does not know", async () => {
    const archived = weeklyGoal("run", { archivedWeek: NEXT_MONDAY });
    await saveWeeklyGoal(db, archived);
    await db.run("UPDATE weekly_goals SET color = 'unknown'");

    expect(await listWeeklyGoals(db)).toEqual([archived]);
  });
});

describe("saveWeeklyGoal", () => {
  test("updates only what can change and marks it as pending", async () => {
    await saveWeeklyGoal(db, weeklyGoal("run"));
    await markSynced(db, "weekly_goals");

    await saveWeeklyGoal(
      db,
      weeklyGoal("run", {
        name: "Correr",
        color: "blue",
        type: "quantitative",
        recurring: false,
        firstWeek: NEXT_MONDAY,
      }),
    );

    expect(await listWeeklyGoals(db)).toEqual([
      weeklyGoal("run", { name: "Correr", color: "blue" }),
    ]);
    expect((await syncState(db, "weekly_goals"))[0].pending_sync).toBe(1);
  });

  test.each([
    ["a first week that is not a Monday", { firstWeek: "2026-11-17" }],
    ["an archived week that is not a Monday", { archivedWeek: "2026-11-17" }],
    [
      "an archived one-off goal",
      { recurring: false, archivedWeek: "2026-11-16" },
    ],
  ])("rejects %s", async (_, overrides) => {
    await expect(
      saveWeeklyGoal(
        db,
        weeklyGoal("run", overrides as Partial<ReturnType<typeof weeklyGoal>>),
      ),
    ).rejects.toThrow();
  });
});

describe("saveWeeklyGoalVersion", () => {
  test("updates the amounts and marks it as pending", async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));
    await markSynced(db, "weekly_goal_versions");
    const changed = weeklyGoalVersion("run", {
      target: 4,
      unit: "km",
      increment: 2,
    });

    await saveWeeklyGoalVersion(db, changed);

    expect(await listWeeklyGoalVersions(db)).toEqual([changed]);
    expect((await syncState(db, "weekly_goal_versions"))[0].pending_sync).toBe(
      1,
    );
  });
});

describe("saveWeeklyGoalChanges", () => {
  test("saves the goal and a new version", async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));
    const added = weeklyGoalVersion("run", {
      id: "run-v2",
      effectiveFrom: NEXT_MONDAY,
    });

    await saveWeeklyGoalChanges(
      db,
      weeklyGoal("run", { name: "Correr" }),
      added,
    );

    expect((await listWeeklyGoals(db))[0].name).toBe("Correr");
    expect(await listWeeklyGoalVersions(db)).toHaveLength(2);
  });

  test("without a version, only saves the goal", async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));

    await saveWeeklyGoalChanges(
      db,
      weeklyGoal("run", { name: "Correr" }),
      null,
    );

    expect((await listWeeklyGoals(db))[0].name).toBe("Correr");
    expect(await listWeeklyGoalVersions(db)).toHaveLength(1);
  });
});

describe("saveWeeklyGoalEntry", () => {
  beforeEach(async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));
  });

  test("there is one total per goal and week, which keeps its id", async () => {
    await saveWeeklyGoalEntry(db, entry("run", 1));
    await markSynced(db, "weekly_goal_entries");

    await saveWeeklyGoalEntry(db, { ...entry("run", 2), id: "another-id" });

    expect(await listWeeklyGoalEntries(db, MONDAY)).toEqual([entry("run", 2)]);
    expect((await syncState(db, "weekly_goal_entries"))[0].pending_sync).toBe(
      1,
    );
  });

  test("only lists the totals of that week", async () => {
    await saveWeeklyGoalEntry(db, entry("run", 1));
    await saveWeeklyGoalEntry(db, entry("run", 2, NEXT_MONDAY));

    expect(await listWeeklyGoalEntries(db, NEXT_MONDAY)).toEqual([
      entry("run", 2, NEXT_MONDAY),
    ]);
  });

  test("rejects a week that is not a Monday", async () => {
    await expect(
      saveWeeklyGoalEntry(db, entry("run", 1, localDate("2026-11-17"))),
    ).rejects.toThrow();
  });

  test("rejects a negative value", async () => {
    await expect(saveWeeklyGoalEntry(db, entry("run", -1))).rejects.toThrow();
  });
});

describe("deleteWeeklyGoal", () => {
  test("marks the goal and its history as deleted, and no other", async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));
    await addWeeklyGoal(db, weeklyGoal("read"), weeklyGoalVersion("read"));
    await saveWeeklyGoalEntry(db, entry("run", 1));
    await saveWeeklyGoalEntry(db, entry("read", 1));
    for (const table of [
      "weekly_goals",
      "weekly_goal_versions",
      "weekly_goal_entries",
    ]) {
      await markSynced(db, table);
    }

    await deleteWeeklyGoal(db, "run");

    expect((await listWeeklyGoals(db)).map((goal) => goal.id)).toEqual([
      "read",
    ]);
    expect(await listWeeklyGoalVersions(db)).toHaveLength(1);
    expect(await listWeeklyGoalEntries(db, MONDAY)).toEqual([entry("read", 1)]);
    const deleted = (await syncState(db, "weekly_goal_entries")).find(
      (row) => row.id === entry("run", 1).id,
    );
    expect(deleted).toMatchObject({ deleted: 1, pending_sync: 1 });
  });

  test("a deleted goal's week can be recorded again by a new goal", async () => {
    await addWeeklyGoal(db, weeklyGoal("run"), weeklyGoalVersion("run"));
    await saveWeeklyGoalEntry(db, entry("run", 1));
    await deleteWeeklyGoal(db, "run");

    await addWeeklyGoal(db, weeklyGoal("swim"), weeklyGoalVersion("swim"));
    await saveWeeklyGoalEntry(db, entry("swim", 2));

    expect(await listWeeklyGoalEntries(db, MONDAY)).toEqual([entry("swim", 2)]);
  });
});
