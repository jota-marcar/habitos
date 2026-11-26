import { localDate } from "./dates";
import {
  COUNTDOWN_DAYS,
  LONG_TERM_GOAL_DIGEST_MOMENT,
  upcomingLongTermGoalDigests,
  type LongTermGoalDigest,
} from "./long-term-goal-digests";
import type { LongTermGoal, LongTermGoalEntry } from "./long-term-goals";
import { localTime } from "./times";

// 2026-11-12 is a Thursday: the next Mondays are the 16th and the 23rd.
const NOW = { date: localDate("2026-11-12"), time: localTime("10:00") };

function goal(id: string, overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id,
    name: id,
    type: "quantitative",
    color: null,
    target: 100,
    unit: "km",
    increment: 1,
    // 100 days from 2 November: one kilometre a day.
    firstDay: localDate("2026-11-02"),
    deadline: localDate("2027-02-09"),
    ...overrides,
  };
}

function entry(goalId: string, value: number): LongTermGoalEntry {
  return { id: `${goalId}-entry`, longTermGoalId: goalId, value };
}

const yesOrNo = (id: string, deadline: string) =>
  goal(id, {
    type: "boolean",
    target: null,
    unit: null,
    increment: null,
    deadline: localDate(deadline),
  });

// "2026-11-16 20:00 run:behind:14" is easier to read in an assertion than the whole object.
function summary(digests: readonly LongTermGoalDigest[]): string[] {
  return digests.map(
    (d) =>
      `${d.date} ${d.time} ${d.goals
        .map((g) =>
          g.reason === "behind"
            ? `${g.goal.id}:behind:${g.amount}`
            : `${g.goal.id}:left:${g.daysLeft}`,
        )
        .join(",")}`,
  );
}

describe("upcomingLongTermGoalDigests (RF-63)", () => {
  test("warns on Mondays at 20:00, with a countdown of 7 days", () => {
    expect(LONG_TERM_GOAL_DIGEST_MOMENT).toEqual({
      daysAfterMonday: 0,
      time: "20:00",
    });
    expect(COUNTDOWN_DAYS).toBe(7);
  });

  test("names the goals behind their pace at each of the next two Mondays", () => {
    const digests = upcomingLongTermGoalDigests(
      { goals: [goal("run")], entries: [entry("run", 6)] },
      NOW,
    );

    // On the 16th, 14 days are over; on the 23rd, 21.
    expect(summary(digests)).toEqual([
      "2026-11-16 20:00 run:behind:8",
      "2026-11-23 20:00 run:behind:15",
    ]);
  });

  test("a goal on pace or ahead needs no warning", () => {
    const digests = upcomingLongTermGoalDigests(
      { goals: [goal("run")], entries: [entry("run", 30)] },
      NOW,
    );

    expect(digests).toEqual([]);
  });

  test("an achieved goal needs no warning", () => {
    const digests = upcomingLongTermGoalDigests(
      { goals: [goal("run")], entries: [entry("run", 100)] },
      NOW,
    );

    expect(digests).toEqual([]);
  });

  test("a yes-or-no goal needs it from 7 days before its deadline, the last one included", () => {
    const digests = upcomingLongTermGoalDigests(
      {
        goals: [
          yesOrNo("far", "2026-11-24"),
          yesOrNo("week", "2026-11-23"),
          yesOrNo("last", "2026-11-16"),
        ],
        entries: [],
      },
      NOW,
    );

    expect(summary(digests)).toEqual([
      "2026-11-16 20:00 last:left:0,week:left:7",
      "2026-11-23 20:00 week:left:0,far:left:1",
    ]);
  });

  test("an achieved yes-or-no goal needs no warning", () => {
    const digests = upcomingLongTermGoalDigests(
      { goals: [yesOrNo("move", "2026-11-17")], entries: [entry("move", 1)] },
      NOW,
    );

    expect(digests).toEqual([]);
  });

  test("goals not in progress that Monday do not count", () => {
    const digests = upcomingLongTermGoalDigests(
      {
        goals: [
          goal("later", { firstDay: localDate("2026-11-20") }),
          goal("ended", { deadline: localDate("2026-11-15") }),
        ],
        entries: [],
      },
      NOW,
    );

    // "later" starts after the 16th: on the 23rd, 3 of its 82 days are over (3,66 km).
    expect(summary(digests)).toEqual(["2026-11-23 20:00 later:behind:3"]);
  });

  test("on a Monday, today's digest is still to come until 20:00", () => {
    const monday = { date: localDate("2026-11-16"), time: localTime("20:00") };
    const digests = upcomingLongTermGoalDigests(
      { goals: [goal("run")], entries: [] },
      monday,
    );

    expect(digests.map((d) => d.date)).toEqual(["2026-11-23", "2026-11-30"]);
    expect(
      upcomingLongTermGoalDigests(
        { goals: [goal("run")], entries: [] },
        { ...monday, time: localTime("19:59") },
      ).map((d) => d.date),
    ).toEqual(["2026-11-16", "2026-11-23"]);
  });
});
