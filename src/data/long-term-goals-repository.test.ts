import { localDate } from "@/domain/dates";

import {
  deleteLongTermGoal,
  listLongTermGoalEntries,
  listLongTermGoals,
  saveLongTermGoal,
  saveLongTermGoalEntry,
} from "./long-term-goals-repository";
import {
  longTermGoal,
  markSynced,
  openMigratedDatabase,
  syncState,
} from "./testing/fixtures";
import type { TestDatabase } from "./testing/node-database";

let db: TestDatabase;

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

function entry(goalId: string, value: number) {
  return { id: `${goalId}-entry`, longTermGoalId: goalId, value };
}

describe("listLongTermGoals", () => {
  test("goes in the order they were created", async () => {
    await saveLongTermGoal(
      db,
      longTermGoal("later", { deadline: localDate("2027-06-30") }),
    );
    await saveLongTermGoal(db, longTermGoal("sooner"));

    const goals = await listLongTermGoals(db);

    expect(goals.map((goal) => goal.id)).toEqual(["later", "sooner"]);
  });

  test("reads a quantitative goal and a color it does not know", async () => {
    const books = longTermGoal("books", {
      type: "quantitative",
      target: 24,
      unit: "libros",
      increment: 1,
    });
    await saveLongTermGoal(db, books);
    await db.run("UPDATE long_term_goals SET color = 'unknown'");

    expect(await listLongTermGoals(db)).toEqual([books]);
  });
});

describe("saveLongTermGoal", () => {
  test("updates everything but the type and the first day, and marks it as pending", async () => {
    await saveLongTermGoal(db, longTermGoal("books"));
    await markSynced(db, "long_term_goals");
    const changes = {
      name: "Leer",
      color: "blue",
      target: 12,
      unit: "libros",
      increment: 2,
      deadline: localDate("2027-01-31"),
    } as const;

    await saveLongTermGoal(
      db,
      longTermGoal("books", {
        ...changes,
        type: "quantitative",
        firstDay: localDate("2026-11-26"),
      }),
    );

    expect(await listLongTermGoals(db)).toEqual([
      longTermGoal("books", changes),
    ]);
    expect((await syncState(db, "long_term_goals"))[0].pending_sync).toBe(1);
  });

  test("rejects a deadline that is not after the first day", async () => {
    await expect(
      saveLongTermGoal(
        db,
        longTermGoal("books", { deadline: localDate("2026-11-25") }),
      ),
    ).rejects.toThrow();
  });
});

describe("saveLongTermGoalEntry", () => {
  beforeEach(async () => {
    await saveLongTermGoal(db, longTermGoal("books"));
  });

  test("there is one total per goal, which keeps its id", async () => {
    await saveLongTermGoalEntry(db, entry("books", 1));
    await markSynced(db, "long_term_goal_entries");

    await saveLongTermGoalEntry(db, { ...entry("books", 2), id: "another-id" });

    expect(await listLongTermGoalEntries(db)).toEqual([entry("books", 2)]);
    expect(
      (await syncState(db, "long_term_goal_entries"))[0].pending_sync,
    ).toBe(1);
  });

  test("rejects a negative value", async () => {
    await expect(
      saveLongTermGoalEntry(db, entry("books", -1)),
    ).rejects.toThrow();
  });

  test("rejects the total of a goal that does not exist", async () => {
    await expect(
      saveLongTermGoalEntry(db, entry("missing", 1)),
    ).rejects.toThrow();
  });
});

describe("deleteLongTermGoal", () => {
  test("marks the goal and its total as deleted, and no other", async () => {
    await saveLongTermGoal(db, longTermGoal("books"));
    await saveLongTermGoal(db, longTermGoal("marathon"));
    await saveLongTermGoalEntry(db, entry("books", 1));
    await saveLongTermGoalEntry(db, entry("marathon", 1));
    await markSynced(db, "long_term_goals");
    await markSynced(db, "long_term_goal_entries");

    await deleteLongTermGoal(db, "books");

    expect((await listLongTermGoals(db)).map((goal) => goal.id)).toEqual([
      "marathon",
    ]);
    expect(await listLongTermGoalEntries(db)).toEqual([entry("marathon", 1)]);
    expect(await syncState(db, "long_term_goals")).toContainEqual(
      expect.objectContaining({ id: "books", deleted: 1, pending_sync: 1 }),
    );
    expect(await syncState(db, "long_term_goal_entries")).toContainEqual(
      expect.objectContaining({
        id: "books-entry",
        deleted: 1,
        pending_sync: 1,
      }),
    );
  });

  test("empties the goal, which keeps a valid deadline (ADR-0023)", async () => {
    await saveLongTermGoal(
      db,
      longTermGoal("books", {
        name: "Leer",
        type: "quantitative",
        target: 24,
        unit: "libros",
        increment: 1,
      }),
    );

    await deleteLongTermGoal(db, "books");

    expect(
      await db.first(
        "SELECT name, type, target, unit, increment, first_day, deadline FROM long_term_goals",
      ),
    ).toEqual({
      name: "",
      type: "boolean",
      target: null,
      unit: null,
      increment: null,
      first_day: "1970-01-05",
      deadline: "1970-01-06",
    });
  });
});
