// The state of the task form and its conversion into a new task (RF-40) or into the changes to
// an existing one (RF-41). The rules are the domain's: this only turns what the user typed into
// its input.

import { parseAmount } from "@/domain/amounts";
import {
  DEFAULT_INCREMENT,
  type HabitColor,
  type HabitType,
} from "@/domain/habits";
import type { Result } from "@/domain/result";
import {
  changeTask,
  createTask,
  dueOf,
  type Task,
  type TaskChanges,
  type TaskError,
} from "@/domain/tasks";
import type { LocalDateTime } from "@/domain/times";

import { formatAmount } from "./format";

export interface TaskFormValues {
  readonly name: string;
  readonly color: HabitColor | null;
  readonly type: HabitType;
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
  readonly due: LocalDateTime;
}

/** The form of a new task, whose due moment starts at `due` (RF-40). */
export function emptyTaskForm(due: LocalDateTime): TaskFormValues {
  return {
    name: "",
    color: null,
    type: "boolean",
    target: "",
    unit: "",
    increment: formatAmount(DEFAULT_INCREMENT),
    due,
  };
}

/** The form filled in with a task, to edit it (RF-41). */
export function taskFormOf(task: Task): TaskFormValues {
  const empty = emptyTaskForm(dueOf(task));
  return {
    ...empty,
    name: task.name,
    color: task.color,
    type: task.type,
    target: task.target === null ? empty.target : formatAmount(task.target),
    unit: task.unit ?? empty.unit,
    increment:
      task.increment === null ? empty.increment : formatAmount(task.increment),
  };
}

// The amounts of a boolean task are ignored, even if they were typed before changing the type.
// Text that is not a number is rejected like a missing amount.
function changesOf(values: TaskFormValues, type: HabitType): TaskChanges {
  const quantitative = type === "quantitative";
  return {
    name: values.name,
    color: values.color,
    target: quantitative ? parseAmount(values.target) : null,
    unit: quantitative ? values.unit : null,
    increment: quantitative ? parseAmount(values.increment) : null,
    due: values.due,
  };
}

/** Builds a new task from the form (RF-40). */
export function buildTask(
  values: TaskFormValues,
  id: string,
  now: LocalDateTime,
): Result<Task, TaskError> {
  return createTask(
    { ...changesOf(values, values.type), type: values.type },
    id,
    now,
  );
}

/** Builds the task with the changes of the form (RF-41). Its type stays as it was. */
export function buildTaskChanges(
  task: Task,
  values: TaskFormValues,
  now: LocalDateTime,
): Result<Task, TaskError> {
  return changeTask(task, changesOf(values, task.type), now);
}

/** The form field each error belongs to, to show it next to it. */
export type TaskFormField = "name" | "amounts" | "due";

export function taskFieldOf(error: TaskError): TaskFormField {
  if (error === "name_empty" || error === "name_too_long") return "name";
  return error === "due_passed" ? "due" : "amounts";
}
