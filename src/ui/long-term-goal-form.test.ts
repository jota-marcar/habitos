import { localDate } from "@/domain/dates";
import type { LongTermGoal } from "@/domain/long-term-goals";

import {
  EMPTY_LONG_TERM_GOAL_FORM,
  buildLongTermGoal,
  buildLongTermGoalChanges,
  isDeadlineError,
  longTermGoalFormOf,
} from "./long-term-goal-form";

const TODAY = localDate("2026-11-12");

const BOOKS: LongTermGoal = {
  id: "books",
  name: "Leer",
  type: "quantitative",
  color: null,
  target: 24,
  unit: "libros",
  increment: 1,
  firstDay: localDate("2026-11-01"),
  deadline: localDate("2026-12-31"),
};

describe("buildLongTermGoal (RF-55)", () => {
  test("builds a goal from what was typed", () => {
    const result = buildLongTermGoal(
      {
        ...EMPTY_LONG_TERM_GOAL_FORM,
        name: " Correr ",
        deadline: localDate("2027-06-17"),
      },
      "run",
      TODAY,
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      goal: expect.objectContaining({
        id: "run",
        name: "Correr",
        type: "boolean",
        firstDay: TODAY,
        deadline: localDate("2027-06-17"),
      }),
    });
  });

  test("rejects a form without a deadline", () => {
    expect(
      buildLongTermGoal(EMPTY_LONG_TERM_GOAL_FORM, "run", TODAY, TODAY),
    ).toEqual({ ok: false, errors: ["name_empty", "deadline_empty"] });
  });
});

describe("buildLongTermGoalChanges (RF-56)", () => {
  test("changes the whole goal, but not its type or its first day", () => {
    const result = buildLongTermGoalChanges(
      BOOKS,
      {
        ...longTermGoalFormOf(BOOKS),
        type: "boolean",
        name: "Leer más",
        color: "blue",
        target: "30",
        deadline: localDate("2027-01-31"),
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      goal: {
        ...BOOKS,
        name: "Leer más",
        color: "blue",
        target: 30,
        deadline: localDate("2027-01-31"),
      },
    });
  });

  test("gathers the errors of the name, the amounts and the deadline", () => {
    const result = buildLongTermGoalChanges(
      BOOKS,
      {
        ...longTermGoalFormOf(BOOKS),
        name: "",
        target: "0",
        deadline: localDate("2026-11-11"),
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: false,
      errors: ["name_empty", "target_not_positive", "deadline_in_past"],
    });
  });
});

test("isDeadlineError tells the errors of the deadline from the rest", () => {
  expect(isDeadlineError("deadline_empty")).toBe(true);
  expect(isDeadlineError("name_empty")).toBe(false);
});
