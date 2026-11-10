import { localDate } from "./dates";
import {
  DEFAULT_INCREMENT,
  DEFAULT_SCHEDULED_DAYS,
  archiveHabit,
  changeConfig,
  createHabit,
  renameHabit,
  versionOn,
  type Habit,
  type HabitConfig,
  type HabitVersion,
  type NewHabit,
} from "./habits";
import { EVERY_DAY, NO_DAYS, scheduledDaysFrom } from "./schedule";

const today = localDate("2026-10-28");
const ids = { habitId: "habit-1", versionId: "version-1" };

const booleanConfig: HabitConfig = {
  scheduledDays: EVERY_DAY,
  target: null,
  unit: null,
  increment: null,
};
const waterConfig: HabitConfig = {
  scheduledDays: EVERY_DAY,
  target: 2,
  unit: "L",
  increment: 0.25,
};
const meditate: NewHabit = {
  name: "Meditar",
  type: "boolean",
  config: booleanConfig,
};
const water: NewHabit = {
  name: "Beber agua",
  type: "quantitative",
  config: waterConfig,
};

function errorsOf(input: NewHabit) {
  const result = createHabit(input, ids, today);
  return result.ok ? [] : result.errors;
}

function created(input: NewHabit) {
  const result = createHabit(input, ids, today);
  if (!result.ok) throw new Error(`Unexpected errors: ${result.errors}`);
  return result.value;
}

describe("createHabit", () => {
  test("creates a boolean habit with its first version effective today", () => {
    expect(created(meditate)).toEqual({
      habit: {
        id: "habit-1",
        name: "Meditar",
        type: "boolean",
        createdOn: today,
        archivedOn: null,
      },
      version: {
        ...booleanConfig,
        id: "version-1",
        habitId: "habit-1",
        effectiveFrom: today,
      },
    });
  });

  test("creates a quantitative habit with target, unit and increment", () => {
    const { habit, version } = created(water);
    expect(habit.type).toBe("quantitative");
    expect(version).toMatchObject({ target: 2, unit: "L", increment: 0.25 });
  });

  test("trims the name and the unit", () => {
    const { habit, version } = created({
      ...water,
      name: "  Beber agua ",
      config: { ...waterConfig, unit: " L " },
    });
    expect(habit.name).toBe("Beber agua");
    expect(version.unit).toBe("L");
  });

  test("the defaults are every day and an increment of 1 (RF-06)", () => {
    expect(DEFAULT_SCHEDULED_DAYS).toBe(EVERY_DAY);
    expect(DEFAULT_INCREMENT).toBe(1);
  });

  test.each(["", "   "])("rejects the empty name %j", (name) => {
    expect(errorsOf({ ...meditate, name })).toEqual(["name_empty"]);
  });

  test("requires at least one scheduled day", () => {
    const config = { ...booleanConfig, scheduledDays: NO_DAYS };
    expect(errorsOf({ ...meditate, config })).toEqual(["scheduled_days_empty"]);
  });

  test("rejects a scheduled days mask that is not valid", () => {
    const config = { ...booleanConfig, scheduledDays: 128 };
    expect(errorsOf({ ...meditate, config })).toEqual([
      "scheduled_days_invalid",
    ]);
  });

  test.each([
    ["a target", { target: 2 }],
    ["a unit", { unit: "L" }],
    ["an increment", { increment: 1 }],
  ])("a boolean habit cannot have %s", (_case, extra) => {
    const config = { ...booleanConfig, ...extra };
    expect(errorsOf({ ...meditate, config })).toEqual(["amounts_not_allowed"]);
  });

  test.each([
    ["missing", null],
    ["zero", 0],
    ["negative", -1],
    ["not finite", Number.POSITIVE_INFINITY],
  ])("rejects a target that is %s", (_case, target) => {
    const config = { ...waterConfig, target };
    expect(errorsOf({ ...water, config })).toEqual(["target_not_positive"]);
  });

  test("rejects a target with more than 2 decimals", () => {
    const config = { ...waterConfig, target: 1.234 };
    expect(errorsOf({ ...water, config })).toEqual(["target_too_precise"]);
  });

  test.each([
    ["missing", null],
    ["empty", ""],
    ["blank", "  "],
  ])("rejects a unit that is %s", (_case, unit) => {
    const config = { ...waterConfig, unit };
    expect(errorsOf({ ...water, config })).toEqual(["unit_empty"]);
  });

  test.each([
    ["missing", null],
    ["zero", 0],
    ["negative", -0.25],
  ])("rejects an increment that is %s", (_case, increment) => {
    const config = { ...waterConfig, increment };
    expect(errorsOf({ ...water, config })).toEqual(["increment_not_positive"]);
  });

  test("rejects an increment with more than 2 decimals", () => {
    const config = { ...waterConfig, increment: 0.125 };
    expect(errorsOf({ ...water, config })).toEqual(["increment_too_precise"]);
  });

  test("reports every error at once", () => {
    const config = {
      scheduledDays: NO_DAYS,
      target: 0,
      unit: "",
      increment: 0,
    };
    expect(errorsOf({ name: "", type: "quantitative", config })).toEqual([
      "name_empty",
      "scheduled_days_empty",
      "target_not_positive",
      "unit_empty",
      "increment_not_positive",
    ]);
  });
});

describe("renameHabit", () => {
  const { habit } = created(meditate);

  test("changes the name, trimmed, and nothing else", () => {
    expect(renameHabit(habit, " Meditación ")).toEqual({
      ok: true,
      value: { ...habit, name: "Meditación" },
    });
  });

  test("rejects an empty name", () => {
    expect(renameHabit(habit, " ")).toEqual({
      ok: false,
      errors: ["name_empty"],
    });
  });
});

describe("archiveHabit", () => {
  const { habit } = created(meditate);

  test("archives the habit as of today", () => {
    expect(archiveHabit(habit, today)).toEqual({ ...habit, archivedOn: today });
  });

  test("keeps the original date if it was already archived", () => {
    const archived = archiveHabit(habit, today);
    expect(archiveHabit(archived, localDate("2026-11-05"))).toBe(archived);
  });
});

describe("versionOn", () => {
  const version = (id: string, effectiveFrom: string): HabitVersion => ({
    ...waterConfig,
    id,
    habitId: "habit-1",
    effectiveFrom: localDate(effectiveFrom),
  });
  // Deliberately out of order: the result must not depend on the order.
  const versions = [
    version("v2", "2026-10-20"),
    version("v1", "2026-10-01"),
    version("v3", "2026-11-01"),
  ];

  test.each([
    ["before the first version", "2026-09-30", null],
    ["the day the first version starts", "2026-10-01", "v1"],
    ["between two versions", "2026-10-19", "v1"],
    ["the day a later version starts", "2026-10-20", "v2"],
    ["the day before the next version", "2026-10-31", "v2"],
    ["after the last version", "2027-01-01", "v3"],
  ])("%s", (_case, date, expectedId) => {
    expect(versionOn(versions, localDate(date))?.id ?? null).toBe(expectedId);
  });

  test("a habit with no versions has no configuration", () => {
    expect(versionOn([], today)).toBeNull();
  });
});

describe("changeConfig", () => {
  const createdOn = localDate("2026-10-01");
  const habit: Habit = {
    id: "habit-1",
    name: "Beber agua",
    type: "quantitative",
    createdOn,
    archivedOn: null,
  };
  const first: HabitVersion = {
    ...waterConfig,
    id: "v1",
    habitId: "habit-1",
    effectiveFrom: createdOn,
  };
  const newTarget: HabitConfig = { ...waterConfig, target: 3 };

  function changed(
    versions: readonly HabitVersion[],
    config: HabitConfig,
    newVersionId = "v2",
  ) {
    const result = changeConfig(habit, versions, config, newVersionId, today);
    if (!result.ok) throw new Error(`Unexpected errors: ${result.errors}`);
    return result.value;
  }

  test("adds a version effective today and keeps the past ones (RF-09)", () => {
    const versions = changed([first], newTarget);
    expect(versions).toEqual([
      first,
      { ...newTarget, id: "v2", habitId: "habit-1", effectiveFrom: today },
    ]);
    expect(versionOn(versions, localDate("2026-10-27"))?.target).toBe(2);
    expect(versionOn(versions, today)?.target).toBe(3);
  });

  test("updates today's version instead of adding another one", () => {
    const once = changed([first], newTarget, "v2");
    const twice = changed(
      once,
      { ...newTarget, scheduledDays: scheduledDaysFrom([0, 2, 4]) },
      "v3",
    );
    expect(twice).toHaveLength(2);
    expect(twice[1]).toMatchObject({
      id: "v2",
      effectiveFrom: today,
      target: 3,
      scheduledDays: scheduledDaysFrom([0, 2, 4]),
    });
  });

  test("updates the first version if the habit was created today", () => {
    const createdToday: HabitVersion = { ...first, effectiveFrom: today };
    expect(changed([createdToday], newTarget)).toEqual([
      { ...createdToday, target: 3 },
    ]);
  });

  test("changes nothing if the configuration is the same", () => {
    const versions = [first];
    expect(changed(versions, { ...waterConfig, unit: " L " })).toBe(versions);
  });

  test("rejects a configuration that is not valid for the type of habit", () => {
    const result = changeConfig(habit, [first], booleanConfig, "v2", today);
    expect(result).toEqual({
      ok: false,
      errors: ["target_not_positive", "unit_empty", "increment_not_positive"],
    });
  });

  test("adds the first version to a habit that has none", () => {
    expect(changed([], newTarget)).toEqual([
      { ...newTarget, id: "v2", habitId: "habit-1", effectiveFrom: today },
    ]);
  });
});
