import { localDate } from "./dates";
import type { Habit } from "./habits";
import type { LongTermGoal } from "./long-term-goals";
import {
  habitOptions,
  longTermGoalOptions,
  weeklyGoalOptions,
} from "./options";
import type { WeeklyGoal } from "./weekly-goals";
import { weekOf } from "./weeks";

const today = localDate("2026-11-12");
const yesterday = localDate("2026-11-11");
const tomorrow = localDate("2026-11-13");

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Beber agua",
    type: "quantitative",
    color: null,
    createdOn: localDate("2026-11-01"),
    archivedOn: null,
    ...overrides,
  };
}

describe("habitOptions (RF-34)", () => {
  test.each([
    ["today", today],
    ["a past day", yesterday],
  ])("a quantitative habit has every option on %s", (_case, date) => {
    expect(habitOptions(habit(), date, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "archive",
      "delete",
    ]);
  });

  test("a boolean habit has no options to correct the amount", () => {
    expect(habitOptions(habit({ type: "boolean" }), today, today)).toEqual([
      "edit",
      "archive",
      "delete",
    ]);
  });

  test.each(["quantitative", "boolean"] as const)(
    "a %s habit cannot be recorded on a future day (RF-20)",
    (type) => {
      expect(habitOptions(habit({ type }), tomorrow, today)).toEqual([
        "edit",
        "archive",
        "delete",
      ]);
    },
  );

  test("an archived habit can still be corrected and deleted, but not edited or archived (RF-10)", () => {
    const archived = habit({ archivedOn: today });

    expect(habitOptions(archived, yesterday, today)).toEqual([
      "decrement",
      "exact_amount",
      "delete",
    ]);
    expect(
      habitOptions({ ...archived, type: "boolean" }, yesterday, today),
    ).toEqual(["delete"]);
  });
});

describe("weeklyGoalOptions (RF-50)", () => {
  const thisWeek = weekOf(today);
  const lastWeek = weekOf(localDate("2026-11-04"));
  const nextWeek = weekOf(localDate("2026-11-18"));

  function goal(overrides: Partial<WeeklyGoal> = {}): WeeklyGoal {
    return {
      id: "g1",
      name: "Proyectos",
      type: "quantitative",
      color: null,
      recurring: true,
      firstWeek: lastWeek.start,
      archivedWeek: null,
      ...overrides,
    };
  }

  test.each([
    ["the current week", thisWeek],
    ["a past week", lastWeek],
  ])("a recurring goal with an amount has every option in %s", (_c, week) => {
    expect(weeklyGoalOptions(goal(), week, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "archive",
      "delete",
    ]);
  });

  test("a yes-or-no goal corrects nothing from its options", () => {
    expect(
      weeklyGoalOptions(goal({ type: "boolean" }), thisWeek, today),
    ).toEqual(["edit", "archive", "delete"]);
  });

  test("nothing is recorded in a future week", () => {
    expect(weeklyGoalOptions(goal(), nextWeek, today)).toEqual([
      "edit",
      "archive",
      "delete",
    ]);
  });

  test("a one-off goal is not archived, and is edited until its week has passed", () => {
    const current = goal({ recurring: false, firstWeek: thisWeek.start });
    expect(weeklyGoalOptions(current, thisWeek, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "delete",
    ]);

    const past = goal({ recurring: false });
    expect(weeklyGoalOptions(past, lastWeek, today)).toEqual([
      "decrement",
      "exact_amount",
      "delete",
    ]);
  });

  test("an archived goal can still be corrected and deleted", () => {
    const archived = goal({ archivedWeek: thisWeek.start });
    expect(weeklyGoalOptions(archived, lastWeek, today)).toEqual([
      "decrement",
      "exact_amount",
      "delete",
    ]);
  });
});

describe("longTermGoalOptions (RF-60)", () => {
  function goal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
    return {
      id: "g1",
      name: "Leer",
      type: "quantitative",
      color: null,
      target: 24,
      unit: "libros",
      increment: 1,
      firstDay: localDate("2026-11-01"),
      deadline: localDate("2026-12-31"),
      ...overrides,
    };
  }

  test("a goal with an amount is corrected, edited and deleted on a day it is in progress", () => {
    expect(longTermGoalOptions(goal(), today, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "delete",
    ]);
    expect(longTermGoalOptions(goal(), yesterday, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "delete",
    ]);
  });

  test("a yes-or-no goal corrects nothing from its options", () => {
    expect(
      longTermGoalOptions(goal({ type: "boolean" }), today, today),
    ).toEqual(["edit", "delete"]);
  });

  test("nothing is recorded on a future day", () => {
    expect(longTermGoalOptions(goal(), tomorrow, today)).toEqual([
      "edit",
      "delete",
    ]);
  });

  test("a goal whose deadline has passed is still corrected, but no longer edited (RF-56)", () => {
    const ended = goal({ deadline: yesterday });
    expect(longTermGoalOptions(ended, yesterday, today)).toEqual([
      "decrement",
      "exact_amount",
      "delete",
    ]);
  });

  test("is never archived (RF-57)", () => {
    expect(longTermGoalOptions(goal(), today, today)).not.toContain("archive");
  });
});
