import { localDate } from "@/domain/dates";
import { EVERY_DAY } from "@/domain/schedule";
import { localTime } from "@/domain/times";

import {
  EMPTY_HABIT_FORM,
  addReminderTime,
  buildHabit,
  fieldOf,
  type HabitFormValues,
} from "./habit-form";

const today = localDate("2026-11-12");

function sequentialIds() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("buildHabit", () => {
  test("starts with a boolean habit due every day, with an increment of 1", () => {
    expect(EMPTY_HABIT_FORM).toMatchObject({
      type: "boolean",
      scheduledDays: EVERY_DAY,
      increment: "1",
      reminderTimes: [],
    });
  });

  test("builds a boolean habit with its reminders", () => {
    const values: HabitFormValues = {
      ...EMPTY_HABIT_FORM,
      name: " Meditar ",
      // Amounts typed before choosing the boolean type are ignored.
      target: "3",
      unit: "min",
      reminderTimes: [localTime("08:00"), localTime("21:00")],
    };

    const result = buildHabit(values, sequentialIds(), today);

    expect(result).toEqual({
      ok: true,
      habit: {
        id: "id-1",
        name: "Meditar",
        type: "boolean",
        createdOn: today,
        archivedOn: null,
      },
      version: {
        id: "id-2",
        habitId: "id-1",
        effectiveFrom: today,
        scheduledDays: EVERY_DAY,
        target: null,
        unit: null,
        increment: null,
      },
      reminders: [
        { id: "id-3", habitId: "id-1", time: "08:00" },
        { id: "id-4", habitId: "id-1", time: "21:00" },
      ],
    });
  });

  test("reads the amounts of a quantitative habit with a decimal comma", () => {
    const values: HabitFormValues = {
      ...EMPTY_HABIT_FORM,
      name: "Beber agua",
      type: "quantitative",
      target: "2",
      unit: "L",
      increment: "0,25",
    };

    const result = buildHabit(values, sequentialIds(), today);

    expect(result.ok && result.version).toMatchObject({
      target: 2,
      unit: "L",
      increment: 0.25,
    });
  });

  test("rejects amounts that are not numbers", () => {
    const values: HabitFormValues = {
      ...EMPTY_HABIT_FORM,
      name: "Beber agua",
      type: "quantitative",
      target: "dos",
      unit: "L",
      increment: "",
    };

    expect(buildHabit(values, sequentialIds(), today)).toEqual({
      ok: false,
      errors: ["target_not_positive", "increment_not_positive"],
    });
  });
});

test("fieldOf places each error next to its field", () => {
  expect(fieldOf("name_empty")).toBe("name");
  expect(fieldOf("name_too_long")).toBe("name");
  expect(fieldOf("scheduled_days_empty")).toBe("scheduledDays");
  expect(fieldOf("scheduled_days_invalid")).toBe("scheduledDays");
  expect(fieldOf("unit_too_long")).toBe("amounts");
});

describe("addReminderTime", () => {
  test("adds the time and keeps the times in order", () => {
    expect(addReminderTime([localTime("21:00")], localTime("08:00"))).toEqual({
      ok: true,
      value: ["08:00", "21:00"],
    });
  });

  test("rejects a time that is already there (RF-22)", () => {
    expect(addReminderTime([localTime("08:00")], localTime("08:00"))).toEqual({
      ok: false,
      errors: ["time_duplicated"],
    });
  });
});
