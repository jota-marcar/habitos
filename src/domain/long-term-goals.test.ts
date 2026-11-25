import { localDate } from "./dates";
import {
  canEditLongTermGoal,
  canRecordLongTermGoal,
  changeLongTermGoalAmounts,
  changeLongTermGoalDeadline,
  createLongTermGoal,
  firstDayOfNewLongTermGoal,
  isInProgress,
  longTermGoalsForDay,
  recolorLongTermGoal,
  renameLongTermGoal,
  validateDeadline,
  type LongTermGoal,
  type NewLongTermGoal,
} from "./long-term-goals";
import { fail } from "./result";

const YESTERDAY = localDate("2026-11-24");
const TODAY = localDate("2026-11-25");
const TOMORROW = localDate("2026-11-26");
const NEXT_WEEK = localDate("2026-12-02");
const NEW_YEAR = localDate("2026-12-31");

const BOOKS = { target: 24, unit: "libros", increment: 1 };
const NO_AMOUNTS = { target: null, unit: null, increment: null };

const NEW_GOAL: NewLongTermGoal = {
  name: "  Leer  ",
  type: "quantitative",
  color: "blue",
  amounts: { ...BOOKS, unit: " libros " },
  deadline: NEW_YEAR,
};

function goal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id: "goal",
    name: "Leer",
    type: "quantitative",
    color: null,
    ...BOOKS,
    firstDay: TODAY,
    deadline: NEW_YEAR,
    ...overrides,
  };
}

describe("firstDayOfNewLongTermGoal", () => {
  test("is the day on screen if it is in the future", () => {
    expect(firstDayOfNewLongTermGoal(NEXT_WEEK, TODAY)).toBe(NEXT_WEEK);
  });

  test("is the current day when created from it or from a past one", () => {
    expect(firstDayOfNewLongTermGoal(TODAY, TODAY)).toBe(TODAY);
    expect(firstDayOfNewLongTermGoal(YESTERDAY, TODAY)).toBe(TODAY);
  });
});

describe("validateDeadline", () => {
  test("accepts a day after the first one, from the current day on", () => {
    expect(validateDeadline(TOMORROW, TODAY, TODAY)).toEqual([]);
    expect(validateDeadline(TODAY, YESTERDAY, TODAY)).toEqual([]);
  });

  test("rejects the first day or one before it", () => {
    expect(validateDeadline(TODAY, TODAY, TODAY)).toEqual([
      "deadline_not_after_first_day",
    ]);
    expect(validateDeadline(YESTERDAY, TODAY, TODAY)).toEqual([
      "deadline_not_after_first_day",
    ]);
  });

  test("rejects a day before the current one", () => {
    expect(validateDeadline(YESTERDAY, localDate("2026-11-01"), TODAY)).toEqual(
      ["deadline_in_past"],
    );
  });
});

describe("createLongTermGoal", () => {
  test("creates a goal with the data trimmed", () => {
    expect(createLongTermGoal(NEW_GOAL, "goal", TODAY, TODAY)).toEqual({
      ok: true,
      value: {
        id: "goal",
        name: "Leer",
        type: "quantitative",
        color: "blue",
        ...BOOKS,
        firstDay: TODAY,
        deadline: NEW_YEAR,
      },
    });
  });

  test("creates a boolean goal without amounts", () => {
    const result = createLongTermGoal(
      { ...NEW_GOAL, type: "boolean", amounts: NO_AMOUNTS },
      "goal",
      TODAY,
      TODAY,
    );
    expect(result).toMatchObject({ ok: true, value: NO_AMOUNTS });
  });

  test("gathers every error of the name, the amounts and the deadline", () => {
    const result = createLongTermGoal(
      {
        ...NEW_GOAL,
        name: " ",
        amounts: { ...BOOKS, target: 0 },
        deadline: TODAY,
      },
      "goal",
      TODAY,
      TODAY,
    );
    expect(result).toEqual(
      fail([
        "name_empty",
        "target_not_positive",
        "deadline_not_after_first_day",
      ]),
    );
  });
});

describe("isInProgress", () => {
  const running = goal({ firstDay: TOMORROW, deadline: NEXT_WEEK });

  test("is in progress from its first day to its deadline, both included", () => {
    expect(isInProgress(running, TOMORROW)).toBe(true);
    expect(isInProgress(running, NEXT_WEEK)).toBe(true);
  });

  test("is not in progress before its first day or after its deadline", () => {
    expect(isInProgress(running, TODAY)).toBe(false);
    expect(isInProgress(running, NEW_YEAR)).toBe(false);
  });
});

describe("canEditLongTermGoal", () => {
  test("can be edited until its deadline, that day included", () => {
    expect(canEditLongTermGoal(goal({ deadline: TODAY }), TODAY)).toBe(true);
  });

  test("cannot be edited once its deadline has passed", () => {
    const ended = goal({
      firstDay: localDate("2026-11-01"),
      deadline: YESTERDAY,
    });
    expect(canEditLongTermGoal(ended, TODAY)).toBe(false);
  });
});

describe("canRecordLongTermGoal", () => {
  const ended = goal({
    firstDay: localDate("2026-11-01"),
    deadline: YESTERDAY,
  });

  test("can be recorded on a day in progress that is not in the future", () => {
    expect(canRecordLongTermGoal(goal(), TODAY, TODAY)).toBe(true);
    expect(canRecordLongTermGoal(ended, YESTERDAY, TODAY)).toBe(true);
  });

  test("cannot be recorded on a future day", () => {
    expect(canRecordLongTermGoal(goal(), TOMORROW, TODAY)).toBe(false);
  });

  test("cannot be recorded on a day it is not in progress", () => {
    expect(canRecordLongTermGoal(ended, TODAY, TODAY)).toBe(false);
  });
});

describe("renameLongTermGoal", () => {
  test("renames the goal, trimmed", () => {
    expect(renameLongTermGoal(goal(), " Leer más ")).toEqual({
      ok: true,
      value: goal({ name: "Leer más" }),
    });
  });

  test("rejects an invalid name", () => {
    expect(renameLongTermGoal(goal(), "")).toEqual(fail(["name_empty"]));
  });
});

describe("recolorLongTermGoal", () => {
  test("gives the goal another color, or none", () => {
    expect(recolorLongTermGoal(goal(), "red")).toEqual(goal({ color: "red" }));
    expect(recolorLongTermGoal(goal({ color: "red" }), null)).toEqual(goal());
  });
});

describe("changeLongTermGoalAmounts", () => {
  test("changes the amounts of the whole goal, trimmed", () => {
    expect(
      changeLongTermGoalAmounts(goal(), {
        target: 12,
        unit: " novelas ",
        increment: 2,
      }),
    ).toEqual({
      ok: true,
      value: goal({ target: 12, unit: "novelas", increment: 2 }),
    });
  });

  test("rejects invalid amounts", () => {
    expect(
      changeLongTermGoalAmounts(goal(), { ...BOOKS, increment: -1 }),
    ).toEqual(fail(["increment_not_positive"]));
  });
});

describe("changeLongTermGoalDeadline", () => {
  test("moves the deadline", () => {
    expect(changeLongTermGoalDeadline(goal(), NEXT_WEEK, TODAY)).toEqual({
      ok: true,
      value: goal({ deadline: NEXT_WEEK }),
    });
  });

  test("rejects a deadline before the current day", () => {
    const started = goal({ firstDay: localDate("2026-11-01") });
    expect(changeLongTermGoalDeadline(started, YESTERDAY, TODAY)).toEqual(
      fail(["deadline_in_past"]),
    );
  });
});

describe("longTermGoalsForDay", () => {
  const books = goal({ id: "books" });
  const marathon = goal({
    id: "marathon",
    type: "boolean",
    ...NO_AMOUNTS,
    deadline: NEXT_WEEK,
  });
  const app = goal({ id: "app", type: "boolean", ...NO_AMOUNTS });
  const future = goal({ id: "future", firstDay: TOMORROW });

  test("shows the goals in progress, the nearest deadline first, each with its total", () => {
    const goals = longTermGoalsForDay(
      {
        goals: [books, marathon, app, future],
        entries: [
          { id: "e1", longTermGoalId: "books", value: 24 },
          { id: "e2", longTermGoalId: "app", value: 0 },
        ],
      },
      TODAY,
    );
    expect(goals).toEqual([
      { goal: marathon, value: 0, done: false },
      { goal: books, value: 24, done: true },
      { goal: app, value: 0, done: false },
    ]);
  });

  test("keeps the order of the goals on the same deadline", () => {
    const goals = longTermGoalsForDay(
      { goals: [app, books], entries: [] },
      TODAY,
    );
    expect(goals.map(({ goal: { id } }) => id)).toEqual(["app", "books"]);
  });

  test("sorts a later deadline after an earlier one in any order", () => {
    const goals = longTermGoalsForDay(
      { goals: [marathon, books], entries: [] },
      TODAY,
    );
    expect(goals.map(({ goal: { id } }) => id)).toEqual(["marathon", "books"]);
  });
});
