// The options of a habit, opened by holding it down in the day view (RF-34). Which ones
// appear depends on the day on screen and on the habit.

import type { LocalDate } from "./dates";
import { canRecordOn } from "./entries";
import type { Habit } from "./habits";
import type { DayTask } from "./tasks";

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
 * The options of a task (RF-46): a closed one can only be deleted (RF-44). Unlike a habit, it
 * can be corrected from any day until it is due, and it is not archived.
 */
export function taskOptions({
  habit,
  closed,
}: Pick<DayTask, "habit" | "closed">): HabitOption[] {
  if (closed) return ["delete"];
  return habit.type === "quantitative"
    ? ["decrement", "exact_amount", "edit", "delete"]
    : ["edit", "delete"];
}
