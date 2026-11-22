import { localDate } from "./dates";
import {
  PROGRESS_DIGEST_MOMENTS,
  UPCOMING_PROGRESS_MOMENTS,
  upcomingProgressDigests,
  type ProgressDigest,
} from "./progress-digests";
import { localTime } from "./times";
import type {
  WeeklyGoal,
  WeeklyGoalEntry,
  WeeklyGoalVersion,
} from "./weekly-goals";

// 2026-11-09 is a Monday, 2026-11-12 a Thursday and 2026-11-15 a Sunday.
const FIRST_WEEK = localDate("2026-11-09");

function goal(id: string, overrides: Partial<WeeklyGoal> = {}): WeeklyGoal {
  return {
    id,
    name: id,
    type: "boolean",
    color: null,
    recurring: true,
    firstWeek: FIRST_WEEK,
    archivedWeek: null,
    ...overrides,
  };
}

function version(
  weeklyGoalId: string,
  overrides: Partial<WeeklyGoalVersion> = {},
): WeeklyGoalVersion {
  return {
    id: `${weeklyGoalId}-v1`,
    weeklyGoalId,
    effectiveFrom: FIRST_WEEK,
    target: null,
    unit: null,
    increment: null,
    ...overrides,
  };
}

function entry(weeklyGoalId: string, week: string, value: number) {
  const entry: WeeklyGoalEntry = {
    id: `${weeklyGoalId}/${week}`,
    weeklyGoalId,
    week: localDate(week),
    value,
  };
  return entry;
}

function at(date: string, time: string) {
  return { date: localDate(date), time: localTime(time) };
}

// "2026-11-12 20:00 read,run" is easier to read in an assertion than the whole object.
function summary(digests: readonly ProgressDigest[]): string[] {
  return digests.map(
    (d) => `${d.date} ${d.time} ${d.goals.map((g) => g.goal.id).join(",")}`,
  );
}

const read = { goals: [goal("read")], versions: [version("read")] };

describe("upcomingProgressDigests", () => {
  test("warns on Thursdays at 20:00 and on Sundays at 11:00 (RF-49)", () => {
    expect(PROGRESS_DIGEST_MOMENTS).toEqual([
      { daysAfterMonday: 3, time: "20:00" },
      { daysAfterMonday: 6, time: "11:00" },
    ]);
  });

  test("schedules the next two weeks of moments", () => {
    const digests = upcomingProgressDigests(
      { ...read, entries: [] },
      at("2026-11-09", "09:00"),
    );

    expect(digests).toHaveLength(UPCOMING_PROGRESS_MOMENTS);
    expect(summary(digests)).toEqual([
      "2026-11-12 20:00 read",
      "2026-11-15 11:00 read",
      "2026-11-19 20:00 read",
      "2026-11-22 11:00 read",
    ]);
  });

  test("a moment that has passed, or is now, does not warn", () => {
    const thursday = upcomingProgressDigests(
      { ...read, entries: [] },
      at("2026-11-12", "20:00"),
    );
    const sunday = upcomingProgressDigests(
      { ...read, entries: [] },
      at("2026-11-15", "11:00"),
    );

    expect(summary(thursday)).toEqual([
      "2026-11-15 11:00 read",
      "2026-11-19 20:00 read",
      "2026-11-22 11:00 read",
      "2026-11-26 20:00 read",
    ]);
    expect(summary(sunday)).toEqual([
      "2026-11-19 20:00 read",
      "2026-11-22 11:00 read",
      "2026-11-26 20:00 read",
      "2026-11-29 11:00 read",
    ]);
  });

  test("still warns earlier the same day", () => {
    const digests = upcomingProgressDigests(
      { ...read, entries: [] },
      at("2026-11-12", "19:59"),
    );

    expect(summary(digests)[0]).toBe("2026-11-12 20:00 read");
  });

  test("a goal achieved this week stops warning this week, but not the next", () => {
    const digests = upcomingProgressDigests(
      { ...read, entries: [entry("read", "2026-11-09", 1)] },
      at("2026-11-10", "09:00"),
    );

    expect(summary(digests)).toEqual([
      "2026-11-19 20:00 read",
      "2026-11-22 11:00 read",
    ]);
  });

  test("a goal halfway to its target still warns, with what it has", () => {
    const [digest] = upcomingProgressDigests(
      {
        goals: [goal("hours", { type: "quantitative" })],
        versions: [version("hours", { target: 5, unit: "h", increment: 1 })],
        entries: [entry("hours", "2026-11-09", 2)],
      },
      at("2026-11-10", "09:00"),
    );

    expect(digest.goals[0].value).toBe(2);
    expect(digest.goals[0].done).toBe(false);
  });

  test("names only the goals left, in the order of the weekly page (RF-46)", () => {
    const digests = upcomingProgressDigests(
      {
        goals: [goal("a"), goal("b"), goal("c")],
        versions: [version("a"), version("b"), version("c")],
        entries: [entry("b", "2026-11-09", 1)],
      },
      at("2026-11-10", "09:00"),
    );

    expect(summary(digests)[0]).toBe("2026-11-12 20:00 a,c");
  });

  test("an archived goal does not count, even in the week it still shows in (RF-44)", () => {
    const digests = upcomingProgressDigests(
      {
        goals: [
          goal("hours", {
            type: "quantitative",
            archivedWeek: FIRST_WEEK,
          }),
        ],
        versions: [version("hours", { target: 5, unit: "h", increment: 1 })],
        entries: [entry("hours", "2026-11-09", 2)],
      },
      at("2026-11-10", "09:00"),
    );

    expect(digests).toEqual([]);
  });

  test("a one-off goal only warns in its week (RF-48)", () => {
    const digests = upcomingProgressDigests(
      {
        goals: [goal("once", { recurring: false })],
        versions: [version("once")],
        entries: [],
      },
      at("2026-11-10", "09:00"),
    );

    expect(summary(digests)).toEqual([
      "2026-11-12 20:00 once",
      "2026-11-15 11:00 once",
    ]);
  });

  test("a goal that starts in a future week warns from that week (RF-42)", () => {
    const start = localDate("2026-11-16");
    const digests = upcomingProgressDigests(
      {
        goals: [goal("later", { firstWeek: start })],
        versions: [version("later", { effectiveFrom: start })],
        entries: [],
      },
      at("2026-11-10", "09:00"),
    );

    expect(summary(digests)).toEqual([
      "2026-11-19 20:00 later",
      "2026-11-22 11:00 later",
    ]);
  });

  test("without goals there is nothing to warn of", () => {
    expect(
      upcomingProgressDigests(
        { goals: [], versions: [], entries: [] },
        at("2026-11-10", "09:00"),
      ),
    ).toEqual([]);
  });
});
