// Tasks: something to do once, before a due day and time (RF-40 to RF-46, ADR-0021).
// Their state is not stored: it follows from what was recorded, the due moment and the clock,
// so a task is missed on time even with the app closed.

import type { LocalDate } from "./dates";
import { isDone, type DayHabit } from "./day";
import {
  validateAmounts,
  validateName,
  type Amounts,
  type AmountsError,
  type HabitColor,
  type HabitType,
  type NameError,
} from "./habits";
import type { Reminder } from "./reminders";
import { fail, ok, type Result } from "./result";
import { EVERY_DAY } from "./schedule";
import {
  isBefore,
  localTime,
  minutesOf,
  shiftMoment,
  type LocalDateTime,
  type LocalTime,
} from "./times";

export interface Task extends Amounts {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the task is created (RF-40). */
  readonly type: HabitType;
  readonly color: HabitColor | null;
  readonly dueOn: LocalDate;
  readonly dueTime: LocalTime;
  /** 1 or 0 in a boolean task; the accumulated amount in a quantitative one. */
  readonly value: number;
  /** The day it was done, which is the day it appears on (RF-42), or null if it is not done. */
  readonly completedOn: LocalDate | null;
}

export type TaskError = NameError | AmountsError | "due_passed";

/** What the user gives a task when creating it. */
export interface NewTask extends Amounts {
  readonly name: string;
  readonly type: HabitType;
  readonly color: HabitColor | null;
  readonly due: LocalDateTime;
}

/** What can change in a task: everything but its type (RF-41). */
export type TaskChanges = Omit<NewTask, "type">;

/** A task as a row of the day view, which shows it like a habit (RF-42). */
export interface DayTask extends DayHabit {
  readonly task: Task;
  /** It reached its due moment without being done (RF-44). */
  readonly missed: boolean;
  /** Its due moment has arrived: it can only be deleted (RF-44). */
  readonly closed: boolean;
}

/** A row of the day view. */
export type DayItem = DayHabit | DayTask;

export function isDayTask(item: DayItem): item is DayTask {
  return "task" in item;
}

const DEFAULT_DUE_TIME = localTime("22:00");
const MINUTES_PER_HOUR = 60;

export function dueOf(task: Task): LocalDateTime {
  return { date: task.dueOn, time: task.dueTime };
}

/** Whether the due moment of `task` has arrived. At that same minute it is already closed. */
export function isClosed(task: Task, now: LocalDateTime): boolean {
  return !isBefore(now, dueOf(task));
}

/**
 * Where the due moment of a new task starts (RF-40): at 22:00 on the day on screen or, if that
 * day has passed, today. If that moment has passed too, at the next o'clock hour.
 */
export function defaultTaskDue(
  shown: LocalDate,
  now: LocalDateTime,
): LocalDateTime {
  const date = shown > now.date ? shown : now.date;
  const due = { date, time: DEFAULT_DUE_TIME };
  if (isBefore(now, due)) return due;
  return shiftMoment(
    now,
    MINUTES_PER_HOUR - (minutesOf(now.time) % MINUTES_PER_HOUR),
  );
}

function validate(
  type: HabitType,
  input: TaskChanges,
  now: LocalDateTime,
): TaskError[] {
  const errors: TaskError[] = [
    ...validateName(input.name),
    ...validateAmounts(type, input),
  ];
  if (!isBefore(now, input.due)) errors.push("due_passed");
  return errors;
}

function normalized(input: TaskChanges) {
  return {
    name: input.name.trim(),
    color: input.color,
    target: input.target,
    unit: input.unit === null ? null : input.unit.trim(),
    increment: input.increment,
    dueOn: input.due.date,
    dueTime: input.due.time,
  };
}

/** Creates a task (RF-40). The identifier is generated outside the domain. */
export function createTask(
  input: NewTask,
  id: string,
  now: LocalDateTime,
): Result<Task, TaskError> {
  const errors = validate(input.type, input, now);
  if (errors.length > 0) return fail(errors);
  return ok({
    ...normalized(input),
    id,
    type: input.type,
    value: 0,
    completedOn: null,
  });
}

// A task that reaches its target counts as done today, or keeps the day it was done on.
function withValue(task: Task, value: number, today: LocalDate): Task {
  const done = isDone(task.type, task, value);
  return {
    ...task,
    value,
    completedOn: done ? (task.completedOn ?? today) : null,
  };
}

/**
 * Applies the changes made to a task (RF-41). A new target may make it done or pending. A task
 * whose due moment has arrived cannot change (RF-44).
 */
export function changeTask(
  task: Task,
  changes: TaskChanges,
  now: LocalDateTime,
): Result<Task, TaskError> {
  if (isClosed(task, now)) return fail(["due_passed"]);
  const errors = validate(task.type, changes, now);
  if (errors.length > 0) return fail(errors);
  return ok(
    withValue({ ...task, ...normalized(changes) }, task.value, now.date),
  );
}

/**
 * The task with `value` recorded at `now`, or null if it is closed (RF-43, RF-44). It may be
 * recorded before its due day: it then counts as done today.
 */
export function recordTask(
  task: Task,
  value: number,
  now: LocalDateTime,
): Task | null {
  return isClosed(task, now) ? null : withValue(task, value, now.date);
}

/** Whether `task` appears on `date` (RF-42): the day it was done, or else its due day. */
export function isTaskOnDay(task: Task, date: LocalDate): boolean {
  return (task.completedOn ?? task.dueOn) === date;
}

/**
 * A task as a row of the day view. A missed task goes with the done ones, in the bottom group
 * (RF-42), so `done` says which group it belongs to.
 */
export function dayTaskOf(task: Task, now: LocalDateTime): DayTask {
  const closed = isClosed(task, now);
  const missed = closed && task.completedOn === null;
  return {
    habit: {
      id: task.id,
      name: task.name,
      type: task.type,
      color: task.color,
      createdOn: task.dueOn,
      archivedOn: null,
    },
    version: {
      id: task.id,
      habitId: task.id,
      effectiveFrom: task.dueOn,
      scheduledDays: EVERY_DAY,
      target: task.target,
      unit: task.unit,
      increment: task.increment,
    },
    value: task.value,
    done: missed || task.completedOn !== null,
    task,
    missed,
    closed,
  };
}

/** The due time of each task, to sort it in the day as if it were its only reminder (RF-42). */
export function dueTimesAsReminders(tasks: readonly Task[]): Reminder[] {
  return tasks.map(({ id, dueTime }) => ({
    id,
    habitId: id,
    time: dueTime,
  }));
}

/** The tasks not done whose due moment is after `moment`, the one due first going first. */
export function tasksPendingAt(
  tasks: readonly Task[],
  moment: LocalDateTime,
): Task[] {
  return tasks
    .filter((task) => task.completedOn === null && !isClosed(task, moment))
    .sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
}

// Dates and times compare correctly as text.
function dueKey({ dueOn, dueTime }: Task): string {
  return `${dueOn} ${dueTime}`;
}

/** The next due moment of a task not done after `now`, or null if there is none. */
export function nextTaskDue(
  tasks: readonly Task[],
  now: LocalDateTime,
): LocalDateTime | null {
  const [next] = tasksPendingAt(tasks, now);
  return next === undefined ? null : dueOf(next);
}

export type TaskAlertMoment = "2h" | "1h" | "due";

/** A warning of a pending task (RF-45). */
export interface TaskAlert {
  readonly task: Task;
  readonly moment: TaskAlertMoment;
  readonly at: LocalDateTime;
}

const ALERT_MINUTES_BEFORE: Readonly<Record<TaskAlertMoment, number>> = {
  "2h": 2 * MINUTES_PER_HOUR,
  "1h": MINUTES_PER_HOUR,
  due: 0,
};

const ALERT_MOMENTS: readonly TaskAlertMoment[] = ["2h", "1h", "due"];

/**
 * The warnings still to come after `now` of the tasks not done (RF-45): those whose time has
 * passed are not sent, and a task that is done has none left.
 */
export function upcomingTaskAlerts(
  tasks: readonly Task[],
  now: LocalDateTime,
): TaskAlert[] {
  return tasksPendingAt(tasks, now).flatMap((task) =>
    ALERT_MOMENTS.map((moment) => ({
      task,
      moment,
      at: shiftMoment(dueOf(task), -ALERT_MINUTES_BEFORE[moment]),
    })).filter(({ at }) => isBefore(now, at)),
  );
}
