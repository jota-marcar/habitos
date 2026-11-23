// What the texts do with a quantitative configuration that lost its amounts, which the forms do
// not allow but a row from another version of the app could have.

import {
  habit,
  version,
  weeklyGoal,
  weeklyGoalVersion,
} from "@/data/testing/fixtures";
import { localDate } from "@/domain/dates";
import type { UpcomingReminder } from "@/domain/reminders";
import { localTime } from "@/domain/times";

import {
  notificationOf,
  progressDigestNotification,
  reminderBody,
} from "./planner";

const DATE = localDate("2026-11-12");
const TIME = localTime("18:00");

function upcoming(value: number): UpcomingReminder {
  return {
    reminder: { id: "r1", habitId: "water", time: TIME },
    date: DATE,
    dayHabit: {
      habit: habit("water", { name: "Agua", type: "quantitative" }),
      version: version("water"),
      value,
    },
  } as unknown as UpcomingReminder;
}

test("a reminder with no target counts it as 0", () => {
  expect(reminderBody(upcoming(1))).toBe("Llevas 1 de 0");
});

test("a reminder with no gesture hint given does not show one", () => {
  expect(notificationOf(upcoming(1)).body).toBe("Llevas 1 de 0");
});

test("a goal with no target in a progress digest counts it as 0", () => {
  const notification = progressDigestNotification({
    date: DATE,
    time: TIME,
    goals: [
      {
        goal: weeklyGoal("run", { name: "Correr", type: "quantitative" }),
        version: weeklyGoalVersion("run"),
        value: 2,
        done: false,
      },
    ],
  });

  expect(notification.body).toContain("Correr 2 de 0");
});
