import { localDate } from "@/domain/dates";
import { EVERY_DAY } from "@/domain/schedule";
import { localTime } from "@/domain/times";

import {
  EMPTY_HABIT_FORM,
  addReminderTime,
  buildHabit,
  buildHabitChanges,
  fieldOf,
  habitFormOf,
  type HabitFormValues,
  type StoredHabit,
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
      color: null,
      scheduledDays: EVERY_DAY,
      increment: "1",
      reminderTimes: [],
    });
  });

  test("builds a boolean habit with its reminders", () => {
    const values: HabitFormValues = {
      ...EMPTY_HABIT_FORM,
      name: " Meditar ",
      color: "blue",
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
        color: "blue",
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

describe("editing a habit (RF-08)", () => {
  const created = localDate("2026-11-01");
  const water: StoredHabit = {
    habit: {
      id: "water",
      name: "Beber agua",
      type: "quantitative",
      color: "teal",
      createdOn: created,
      archivedOn: null,
    },
    versions: [
      {
        id: "water-v1",
        habitId: "water",
        effectiveFrom: created,
        scheduledDays: EVERY_DAY,
        target: 2,
        unit: "L",
        increment: 0.25,
      },
    ],
    reminders: [
      { id: "r2", habitId: "water", time: localTime("18:00") },
      { id: "r1", habitId: "water", time: localTime("10:00") },
    ],
  };
  const waterForm = habitFormOf(
    water.habit,
    water.versions[0],
    water.reminders,
  );

  test("fills the form in with the habit, its amounts as text and its times in order", () => {
    expect(waterForm).toEqual({
      name: "Beber agua",
      color: "teal",
      type: "quantitative",
      target: "2",
      unit: "L",
      increment: "0,25",
      scheduledDays: EVERY_DAY,
      reminderTimes: ["10:00", "18:00"],
    });
  });

  test("a boolean habit leaves the amounts of the form as in a new one", () => {
    const walk = { ...water.habit, type: "boolean" as const };
    const version = {
      ...water.versions[0],
      target: null,
      unit: null,
      increment: null,
    };

    expect(habitFormOf(walk, version, [])).toMatchObject({
      target: "",
      unit: "",
      increment: "1",
      reminderTimes: [],
    });
  });

  test("a form left as it was changes nothing", () => {
    expect(buildHabitChanges(water, waterForm, sequentialIds(), today)).toEqual(
      {
        ok: true,
        changes: {
          habit: water.habit,
          version: null,
          addedReminders: [],
          removedReminderIds: [],
        },
      },
    );
  });

  test("a new configuration is a new version from today; the name changes in the habit (RF-09)", () => {
    const values = { ...waterForm, name: " Agua ", target: "1,5" };

    const result = buildHabitChanges(water, values, sequentialIds(), today);

    expect(result).toEqual({
      ok: true,
      changes: {
        habit: { ...water.habit, name: "Agua" },
        version: {
          ...water.versions[0],
          id: "id-1",
          effectiveFrom: today,
          target: 1.5,
        },
        addedReminders: [],
        removedReminderIds: [],
      },
    });
  });

  test("the color changes in the habit, without a new version (ADR-0014)", () => {
    const recolored = buildHabitChanges(
      water,
      { ...waterForm, color: "pink" },
      sequentialIds(),
      today,
    );
    const plain = buildHabitChanges(
      water,
      { ...waterForm, color: null },
      sequentialIds(),
      today,
    );

    expect(recolored).toMatchObject({
      ok: true,
      changes: { habit: { ...water.habit, color: "pink" }, version: null },
    });
    expect(plain).toMatchObject({
      ok: true,
      changes: { habit: { ...water.habit, color: null }, version: null },
    });
  });

  test("a second change on the same day updates the version of today", () => {
    const edited = {
      ...water.versions[0],
      id: "water-v2",
      effectiveFrom: today,
    };
    const stored = { ...water, versions: [...water.versions, edited] };

    const result = buildHabitChanges(
      stored,
      { ...waterForm, unit: "litros" },
      sequentialIds(),
      today,
    );

    expect(result.ok && result.changes.version).toEqual({
      ...edited,
      unit: "litros",
    });
  });

  test("only the reminders whose time was added or removed change", () => {
    const values = {
      ...waterForm,
      reminderTimes: [localTime("08:30"), localTime("18:00")],
    };

    const result = buildHabitChanges(water, values, sequentialIds(), today);

    expect(result.ok && result.changes).toMatchObject({
      addedReminders: [{ id: "id-2", habitId: "water", time: "08:30" }],
      removedReminderIds: ["r1"],
    });
  });

  test("the type stays as it was, whatever the form says (RF-06)", () => {
    const result = buildHabitChanges(
      water,
      { ...waterForm, type: "boolean", target: "3" },
      sequentialIds(),
      today,
    );

    expect(result.ok && result.changes).toMatchObject({
      habit: { type: "quantitative" },
      version: { target: 3 },
    });
  });

  test("rejects a wrong name and a wrong configuration at once", () => {
    const values = { ...waterForm, name: "", target: "0", scheduledDays: 0 };

    expect(buildHabitChanges(water, values, sequentialIds(), today)).toEqual({
      ok: false,
      errors: ["name_empty", "scheduled_days_empty", "target_not_positive"],
    });
  });

  test("rejects each of them on its own", () => {
    const build = (changes: Partial<HabitFormValues>) =>
      buildHabitChanges(
        water,
        { ...waterForm, ...changes },
        sequentialIds(),
        today,
      );

    expect(build({ name: "" })).toEqual({ ok: false, errors: ["name_empty"] });
    expect(build({ unit: "" })).toEqual({ ok: false, errors: ["unit_empty"] });
  });
});
