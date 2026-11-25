// The options of a habit, a weekly goal or a long-term goal, opened by holding it down in its list
// (RF-34, RF-50, RF-60). Which ones appear depends on the day or the week on screen and on the item.

import type { LocalDate } from "./dates";
import { canRecordOn } from "./entries";
import type { Habit } from "./habits";
import {
  canEditLongTermGoal,
  canRecordLongTermGoal,
  type LongTermGoal,
} from "./long-term-goals";
import { canEditWeeklyGoal, type WeeklyGoal } from "./weekly-goals";
import type { Week } from "./weeks";

export type HabitOption =
  "decrement" | "exact_amount" | "edit" | "archive" | "delete";

/**
 * The options of `habit` on `date`, in the order they are shown.
 * - What was recorded can be corrected on past days and today, also in an archived habit
 *   (RF-10, RF-19), but not on future days (RF-20). Only quantitative habits need options for
 *   it: a boolean one is unmarked with a tap.
 * - An archived habit can no longer be edited or archived (RF-10).
 * - Any habit can be deleted from any day (RF-11).
 */
export function habitOptions(
  habit: Habit,
  date: LocalDate,
  today: LocalDate,
): HabitOption[] {
  const options: HabitOption[] = [];
  if (habit.type === "quantitative" && canRecordOn(date, today)) {
    options.push("decrement", "exact_amount");
  }
  if (habit.archivedOn === null) options.push("edit", "archive");
  options.push("delete");
  return options;
}

/**
 * The options of `goal` in `week`, in the order they are shown (RF-50).
 * - What was recorded can be corrected in the current week and past ones, not in future ones
 *   (RF-47). Only goals with an amount need options for it.
 * - A one-off goal whose week has passed and an archived goal can no longer be edited (RF-43).
 * - Only a recurring goal that is not archived can be archived (RF-44).
 * - Any goal can be deleted from any week (RF-45).
 */
export function weeklyGoalOptions(
  goal: WeeklyGoal,
  week: Week,
  today: LocalDate,
): HabitOption[] {
  const options: HabitOption[] = [];
  if (goal.type === "quantitative" && canRecordOn(week.start, today)) {
    options.push("decrement", "exact_amount");
  }
  if (canEditWeeklyGoal(goal, today)) options.push("edit");
  if (goal.recurring && goal.archivedWeek === null) options.push("archive");
  options.push("delete");
  return options;
}

/**
 * The options of a long-term `goal` while `day` is on screen, in the order they are shown
 * (RF-60).
 * - What was recorded can be corrected whenever something can be recorded (RF-59). Only goals
 *   with an amount need options for it.
 * - A goal whose deadline has passed can no longer be edited (RF-56).
 * - Goals are not archived: they end on their deadline (RF-57).
 * - Any goal can be deleted (RF-57).
 */
export function longTermGoalOptions(
  goal: LongTermGoal,
  day: LocalDate,
  today: LocalDate,
): HabitOption[] {
  const options: HabitOption[] = [];
  if (goal.type === "quantitative" && canRecordLongTermGoal(goal, day, today)) {
    options.push("decrement", "exact_amount");
  }
  if (canEditLongTermGoal(goal, today)) options.push("edit");
  options.push("delete");
  return options;
}
