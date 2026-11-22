import { localDate } from "./dates";
import { fail } from "./result";
import {
  archiveWeeklyGoal,
  canEditWeeklyGoal,
  changeWeeklyGoalAmounts,
  createWeeklyGoal,
  firstWeekOfNewGoal,
  goalsForWeek,
  recolorWeeklyGoal,
  renameWeeklyGoal,
  type NewWeeklyGoal,
  type WeeklyGoal,
  type WeeklyGoalEntry,
  type WeeklyGoalVersion,
} from "./weekly-goals";
import { weekOf } from "./weeks";

const LAST_MONDAY = localDate("2026-11-09");
const MONDAY = localDate("2026-11-16");
const THURSDAY = localDate("2026-11-19");
const NEXT_MONDAY = localDate("2026-11-23");
const NEXT_THURSDAY = localDate("2026-11-26");

const IDS = { goalId: "goal", versionId: "goal-v1" };
const HOURS = { target: 5, unit: "h", increment: 0.5 };
const NO_AMOUNTS = { target: null, unit: null, increment: null };

const NEW_GOAL: NewWeeklyGoal = {
  name: "Proyectos",
  type: "quantitative",
  color: null,
  recurring: true,
  amounts: HOURS,
};

function goal(overrides: Partial<WeeklyGoal> = {}): WeeklyGoal {
  return {
    id: "goal",
    name: "Proyectos",
    type: "quantitative",
    color: null,
    recurring: true,
    firstWeek: MONDAY,
    archivedWeek: null,
    ...overrides,
  };
}

function version(
  overrides: Partial<WeeklyGoalVersion> = {},
): WeeklyGoalVersion {
  return {
    id: "goal-v1",
    weeklyGoalId: "goal",
    effectiveFrom: MONDAY,
    ...HOURS,
    ...overrides,
  };
}

function entry(
  value: number,
  overrides: Partial<WeeklyGoalEntry> = {},
): WeeklyGoalEntry {
  return {
    id: "goal-entry",
    weeklyGoalId: "goal",
    week: MONDAY,
    value,
    ...overrides,
  };
}

describe("firstWeekOfNewGoal", () => {
  test("is the week on screen if it is in the future", () => {
    expect(firstWeekOfNewGoal(NEXT_THURSDAY, THURSDAY)).toBe(NEXT_MONDAY);
  });

  test("is the current week when created from it", () => {
    expect(firstWeekOfNewGoal(THURSDAY, THURSDAY)).toBe(MONDAY);
  });

  test("is the current week when created from a past one", () => {
    expect(firstWeekOfNewGoal(LAST_MONDAY, THURSDAY)).toBe(MONDAY);
  });
});

describe("createWeeklyGoal", () => {
  test("creates the goal and its first version from its first week", () => {
    const result = createWeeklyGoal(
      { ...NEW_GOAL, name: "  Proyectos ", amounts: { ...HOURS, unit: " h " } },
      IDS,
      MONDAY,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        goal: goal(),
        version: version(),
      },
    });
  });

  test("a boolean goal has no amounts", () => {
    const result = createWeeklyGoal(
      { ...NEW_GOAL, type: "boolean", recurring: false, amounts: NO_AMOUNTS },
      IDS,
      MONDAY,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        goal: goal({ type: "boolean", recurring: false }),
        version: version(NO_AMOUNTS),
      },
    });
  });

  test("reports every error at once", () => {
    const result = createWeeklyGoal(
      { ...NEW_GOAL, name: " ", amounts: { ...HOURS, target: 0 } },
      IDS,
      MONDAY,
    );

    expect(result).toEqual(fail(["name_empty", "target_not_positive"]));
  });

  test("a boolean goal cannot have amounts", () => {
    const result = createWeeklyGoal(
      { ...NEW_GOAL, type: "boolean" },
      IDS,
      MONDAY,
    );

    expect(result).toEqual(fail(["amounts_not_allowed"]));
  });
});

describe("canEditWeeklyGoal", () => {
  test("a recurring goal can be edited", () => {
    expect(canEditWeeklyGoal(goal({ firstWeek: LAST_MONDAY }), THURSDAY)).toBe(
      true,
    );
  });

  test("an archived goal cannot", () => {
    expect(canEditWeeklyGoal(goal({ archivedWeek: MONDAY }), THURSDAY)).toBe(
      false,
    );
  });

  test("a one-off goal can until its week has passed", () => {
    const oneOff = goal({ recurring: false });

    expect(canEditWeeklyGoal(oneOff, THURSDAY)).toBe(true);
    expect(canEditWeeklyGoal(oneOff, NEXT_MONDAY)).toBe(false);
  });
});

describe("renameWeeklyGoal", () => {
  test("changes the name, without surrounding spaces", () => {
    expect(renameWeeklyGoal(goal(), "  Leer ")).toEqual({
      ok: true,
      value: goal({ name: "Leer" }),
    });
  });

  test("rejects an empty name", () => {
    expect(renameWeeklyGoal(goal(), " ")).toEqual(fail(["name_empty"]));
  });
});

describe("recolorWeeklyGoal", () => {
  test("gives the goal another color or none", () => {
    expect(recolorWeeklyGoal(goal(), "teal").color).toBe("teal");
    expect(recolorWeeklyGoal(goal({ color: "teal" }), null).color).toBeNull();
  });
});

describe("archiveWeeklyGoal", () => {
  test("archives a recurring goal as of the current week", () => {
    expect(archiveWeeklyGoal(goal(), NEXT_THURSDAY).archivedWeek).toBe(
      NEXT_MONDAY,
    );
  });

  test("a one-off goal is not archived", () => {
    const oneOff = goal({ recurring: false });

    expect(archiveWeeklyGoal(oneOff, THURSDAY)).toBe(oneOff);
  });

  test("archiving an archived goal changes nothing", () => {
    const archived = goal({ archivedWeek: MONDAY });

    expect(archiveWeeklyGoal(archived, NEXT_THURSDAY)).toBe(archived);
  });
});

describe("changeWeeklyGoalAmounts", () => {
  const changed = { target: 3, unit: "h", increment: 1 };

  test("adds a version from the current week and keeps the past ones", () => {
    const first = version({ effectiveFrom: LAST_MONDAY });

    const result = changeWeeklyGoalAmounts(
      goal({ firstWeek: LAST_MONDAY }),
      [first],
      changed,
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual({
      ok: true,
      value: [
        first,
        {
          ...changed,
          id: "goal-v2",
          weeklyGoalId: "goal",
          effectiveFrom: MONDAY,
        },
      ],
    });
  });

  test("updates the version already effective this week", () => {
    const result = changeWeeklyGoalAmounts(
      goal(),
      [version()],
      changed,
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual({ ok: true, value: [version(changed)] });
  });

  test("updating this week's version leaves the past ones as they were", () => {
    const past = version({ id: "goal-v0", effectiveFrom: LAST_MONDAY });

    const result = changeWeeklyGoalAmounts(
      goal({ firstWeek: LAST_MONDAY }),
      [past, version()],
      changed,
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual({ ok: true, value: [past, version(changed)] });
  });

  test("a goal that has not started changes from its first week", () => {
    const planned = goal({ firstWeek: NEXT_MONDAY });
    const first = version({ effectiveFrom: NEXT_MONDAY });

    const result = changeWeeklyGoalAmounts(
      planned,
      [first],
      changed,
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual({
      ok: true,
      value: [{ ...first, ...changed }],
    });
  });

  test("the same amounts change nothing", () => {
    const versions = [version()];

    const result = changeWeeklyGoalAmounts(
      goal(),
      versions,
      { ...HOURS, unit: " h " },
      "goal-v2",
      NEXT_THURSDAY,
    );

    expect(result).toEqual({ ok: true, value: versions });
  });

  test("adds the first version if the goal had none", () => {
    const result = changeWeeklyGoalAmounts(
      goal(),
      [],
      changed,
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          ...changed,
          id: "goal-v2",
          weeklyGoalId: "goal",
          effectiveFrom: MONDAY,
        },
      ],
    });
  });

  test("rejects invalid amounts", () => {
    const result = changeWeeklyGoalAmounts(
      goal(),
      [version()],
      { ...HOURS, increment: 0 },
      "goal-v2",
      THURSDAY,
    );

    expect(result).toEqual(fail(["increment_not_positive"]));
  });
});

describe("goalsForWeek", () => {
  const namesIn = (
    goals: readonly WeeklyGoal[],
    monday = MONDAY,
    entries: readonly WeeklyGoalEntry[] = [],
  ) =>
    goalsForWeek(
      {
        goals,
        versions: goals.map((g) =>
          version({
            id: `${g.id}-v1`,
            weeklyGoalId: g.id,
            effectiveFrom: g.firstWeek,
          }),
        ),
        entries,
      },
      weekOf(monday),
    ).map((weekGoal) => weekGoal.goal.id);

  test("a recurring goal appears from its first week onwards", () => {
    expect(namesIn([goal()], LAST_MONDAY)).toEqual([]);
    expect(namesIn([goal()], MONDAY)).toEqual(["goal"]);
    expect(namesIn([goal()], NEXT_MONDAY)).toEqual(["goal"]);
  });

  test("a one-off goal only appears in its week (RF-48)", () => {
    const oneOff = goal({ recurring: false });

    expect(namesIn([oneOff], LAST_MONDAY)).toEqual([]);
    expect(namesIn([oneOff], MONDAY)).toEqual(["goal"]);
    expect(namesIn([oneOff], NEXT_MONDAY)).toEqual([]);
  });

  test("an archived goal stops appearing after its week (RF-44)", () => {
    const archived = goal({
      firstWeek: LAST_MONDAY,
      archivedWeek: MONDAY,
    });

    expect(namesIn([archived], LAST_MONDAY)).toEqual(["goal"]);
    expect(
      namesIn([archived], NEXT_MONDAY, [entry(1, { week: NEXT_MONDAY })]),
    ).toEqual([]);
  });

  test("the week it was archived only shows it with something recorded", () => {
    const archived = goal({ archivedWeek: MONDAY });

    expect(namesIn([archived], MONDAY)).toEqual([]);
    expect(namesIn([archived], MONDAY, [entry(1)])).toEqual(["goal"]);
  });

  test("keeps the order of the goals", () => {
    expect(namesIn([goal({ id: "b" }), goal({ id: "a" })])).toEqual(["b", "a"]);
  });

  test("a goal without a version in force does not appear", () => {
    expect(
      goalsForWeek(
        { goals: [goal()], versions: [], entries: [] },
        weekOf(MONDAY),
      ),
    ).toEqual([]);
  });

  test("gives the total of that week and whether the target is reached", () => {
    const entries = [entry(2, { id: "past", week: LAST_MONDAY }), entry(5)];

    expect(
      goalsForWeek(
        {
          goals: [goal({ firstWeek: LAST_MONDAY })],
          versions: [version({ effectiveFrom: LAST_MONDAY })],
          entries,
        },
        weekOf(THURSDAY),
      ),
    ).toEqual([
      {
        goal: goal({ firstWeek: LAST_MONDAY }),
        version: version({ effectiveFrom: LAST_MONDAY }),
        value: 5,
        done: true,
      },
    ]);
  });

  test("a week with nothing recorded starts from zero (RF-48)", () => {
    const [weekGoal] = goalsForWeek(
      {
        goals: [goal()],
        versions: [version()],
        entries: [entry(5)],
      },
      weekOf(NEXT_MONDAY),
    );

    expect(weekGoal).toMatchObject({ value: 0, done: false });
  });

  test("past weeks keep the target they had", () => {
    const versions = [
      version({ effectiveFrom: LAST_MONDAY, target: 5 }),
      version({ id: "goal-v2", effectiveFrom: MONDAY, target: 3 }),
    ];
    const data = {
      goals: [goal({ firstWeek: LAST_MONDAY })],
      versions,
      entries: [entry(3, { id: "past", week: LAST_MONDAY }), entry(3)],
    };

    expect(goalsForWeek(data, weekOf(LAST_MONDAY))[0].done).toBe(false);
    expect(goalsForWeek(data, weekOf(MONDAY))[0].done).toBe(true);
  });

  test("a boolean goal is done when it is marked", () => {
    const [weekGoal] = goalsForWeek(
      {
        goals: [goal({ type: "boolean" })],
        versions: [version(NO_AMOUNTS)],
        entries: [entry(1)],
      },
      weekOf(MONDAY),
    );

    expect(weekGoal.done).toBe(true);
  });
});
