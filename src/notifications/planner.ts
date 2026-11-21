// The reminder planner: keeps the local notifications of iOS in line with the reminders that
// have to warn next (ADR-0005). The domain decides which ones; this module turns them into
// notifications and only schedules or cancels what changed, so that frequent refreshes (one
// after every change) stay cheap.

import type { Database } from "@/data/database";
import { listEntries } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { listTasks } from "@/data/tasks-repository";
import { localDate, localDateOf, type LocalDate } from "@/domain/dates";
import { habitsForDay, type DayHabit } from "@/domain/day";
import { upcomingPendingDigests, type PendingDigest } from "@/domain/digests";
import type { Habit } from "@/domain/habits";
import {
  MAX_UPCOMING_REMINDERS,
  SNOOZE_MINUTES,
  showsGestureHint,
  upcomingReminders,
  type GestureHint,
  type UpcomingReminder,
} from "@/domain/reminders";
import {
  upcomingTaskAlerts,
  type Task,
  type TaskAlert,
  type TaskAlertMoment,
} from "@/domain/tasks";
import { localTimeOf, type LocalDateTime } from "@/domain/times";
import { formatAmount } from "@/ui/format";

import type {
  NotificationButton,
  NotificationCategory,
  Notifier,
  PlannedNotification,
} from "./notifier";

/** Every reminder of the window has an identifier that starts like this. */
export const REMINDER_PREFIX = "reminder.";

/** Every pending digest of the window has an identifier that starts like this (RF-37). */
export const DIGEST_PREFIX = "digest.";

/** Every snoozed notification has an identifier that starts like this. */
export const SNOOZE_PREFIX = "snooze.";

/** Every task alert of the window has an identifier that starts like this (RF-45). */
export const TASK_PREFIX = "task.";

/** The buttons of the reminders (RF-25). */
export const BUTTONS = { done: "done", add: "add", snooze: "snooze" } as const;

const BOOLEAN_CATEGORY = "reminder_boolean";
const QUANTITATIVE_CATEGORY_PREFIX = "reminder_add_";
const TASK_BOOLEAN_CATEGORY = "task_boolean";
const TASK_QUANTITATIVE_CATEGORY_PREFIX = "task_add_";

// Future days cannot be recorded (RF-20), so this only bounds a query that reaches today.
const LAST_DATE = localDate("9999-12-31");

/** The minute of `instant` in the device's local time. */
export function localDateTimeOf(instant: Date): LocalDateTime {
  return { date: localDateOf(instant), time: localTimeOf(instant) };
}

/** The instant at which a minute of a local day starts. */
export function instantOf({ date, time }: LocalDateTime): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/**
 * What a reminder says: the name of the habit and, if it is quantitative, how it is going
 * that day (RF-24): "Llevas 1 de 2 L".
 */
export function reminderBody({ dayHabit }: UpcomingReminder): string | null {
  const { habit, version, value } = dayHabit;
  if (habit.type !== "quantitative") return null;
  const target = formatAmount(version.target ?? 0);
  return `Llevas ${formatAmount(value)} de ${target} ${version.unit ?? ""}`.trim();
}

// iOS only shows the buttons of a notification after pressing and holding it (RF-25).
const GESTURE_HINTS: Readonly<Record<Habit["type"], string>> = {
  boolean: "Mantén pulsado para marcarlo o posponerlo",
  quantitative: "Mantén pulsado para sumar o posponerlo",
};

/** The gesture hint is not being shown: nothing to explain and nothing to remember. */
export const NO_GESTURE_HINT: GestureHint = { startedOn: null, learned: true };

function withoutGestureHint(body: string | null): string | null {
  if (body === null) return null;
  const hints = Object.values(GESTURE_HINTS);
  const text = body
    .split("\n")
    .filter((line) => !hints.includes(line))
    .join("\n");
  return text === "" ? null : text;
}

/**
 * The category of the reminders of a habit. A boolean habit is marked done; a quantitative
 * one adds its increment, which the button shows, so each one has a category of its own.
 */
export function categoryOf(habit: Habit): string {
  return habit.type === "boolean"
    ? BOOLEAN_CATEGORY
    : `${QUANTITATIVE_CATEGORY_PREFIX}${habit.id.replace(/[:-]/g, "_")}`;
}

const SNOOZE_BUTTON: NotificationButton = {
  id: BUTTONS.snooze,
  title: `Posponer ${SNOOZE_MINUTES / 60} h`,
};

/** The buttons of the reminders of a habit, as it is that day (RF-25). */
export function categoryOfDay({
  habit,
  version,
}: DayHabit): NotificationCategory {
  const increment = formatAmount(version.increment ?? 0);
  const main: NotificationButton =
    habit.type === "boolean"
      ? { id: BUTTONS.done, title: "Hecho" }
      : {
          id: BUTTONS.add,
          title: `+${increment} ${version.unit ?? ""}`.trim(),
        };
  return { id: categoryOf(habit), buttons: [main, SNOOZE_BUTTON] };
}

/** The notification of a reminder on a specific day. */
export function notificationOf(
  upcoming: UpcomingReminder,
  gestureHint: GestureHint = NO_GESTURE_HINT,
): PlannedNotification {
  const { reminder, date, dayHabit } = upcoming;
  const body = reminderBody(upcoming);
  const hint = showsGestureHint(gestureHint, date)
    ? GESTURE_HINTS[dayHabit.habit.type]
    : null;
  return {
    id: `${REMINDER_PREFIX}${reminder.id}.${date}`,
    at: { date, time: reminder.time },
    title: dayHabit.habit.name,
    body: hint === null ? body : body === null ? hint : `${body}\n${hint}`,
    habitId: dayHabit.habit.id,
    category: categoryOf(dayHabit.habit),
  };
}

// A digest names a few habits at most, each shortened if it is long, so that the list fits in
// the lines iOS shows (RF-37).
const DIGEST_NAMES = 3;
const DIGEST_NAME_LENGTH = 25;

function shortened(name: string): string {
  // By characters, not UTF-16 units, so that an emoji is never cut in half.
  const characters = [...name.trim()];
  if (characters.length <= DIGEST_NAME_LENGTH) return characters.join("");
  return `${characters
    .slice(0, DIGEST_NAME_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/** "y", or "e" before a word that starts with the sound "i", as Spanish asks ("Leer e Ir"). */
function andBefore(word: string): string {
  return /^h?[ií](?![aeouáéóú])/i.test(word) ? "e" : "y";
}

/** "A", "A y B", "A, B y C"; "A, B, C y 2 más" when there are more than fit. */
function listOf(names: readonly string[]): string {
  const shown = names.slice(0, DIGEST_NAMES).map(shortened);
  const rest = names.length - shown.length;
  const items = rest > 0 ? [...shown, `${rest} más`] : shown;
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${andBefore(last)} ${last}`;
}

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Te queda 1 hábito", "Te quedan 2 tareas", "Te quedan 2 hábitos y 1 tarea" (RF-37). */
function digestTitle(habits: number, tasks: number): string {
  const parts = [
    ...(habits > 0 ? [countOf(habits, "hábito", "hábitos")] : []),
    ...(tasks > 0 ? [countOf(tasks, "tarea", "tareas")] : []),
  ];
  return `${habits + tasks === 1 ? "Te queda" : "Te quedan"} ${parts.join(" y ")}`;
}

/**
 * The notification of a pending digest: how much is left, and what (RF-37). The tasks go first,
 * because they have a deadline.
 */
export function digestNotification(digest: PendingDigest): PlannedNotification {
  const { date, time, habits, tasks } = digest;
  return {
    id: `${DIGEST_PREFIX}${date}.${time}`,
    at: { date, time },
    title: digestTitle(habits.length, tasks.length),
    body: listOf([
      ...tasks.map((task) => task.name),
      ...habits.map((d) => d.habit.name),
    ]),
    habitId: null,
    category: null,
  };
}

const TASK_ALERT_TEXTS: Readonly<Record<TaskAlertMoment, string>> = {
  "2h": "Vence en 2 horas",
  "1h": "Vence en 1 hora",
  due: "No se ha realizado a tiempo",
};

/** The category of the alerts of a task: its button, without snoozing (RF-45). */
export function taskCategoryOf(task: Task): NotificationCategory {
  if (task.type === "boolean") {
    return {
      id: TASK_BOOLEAN_CATEGORY,
      buttons: [{ id: BUTTONS.done, title: "Hecho" }],
    };
  }
  const increment = formatAmount(task.increment ?? 0);
  return {
    id: `${TASK_QUANTITATIVE_CATEGORY_PREFIX}${task.id.replace(/[:-]/g, "_")}`,
    buttons: [
      { id: BUTTONS.add, title: `+${increment} ${task.unit ?? ""}`.trim() },
    ],
  };
}

/** The notification of a task alert (RF-45). The one at the due moment has no buttons. */
export function taskAlertNotification({
  task,
  moment,
  at,
}: TaskAlert): PlannedNotification {
  const text = TASK_ALERT_TEXTS[moment];
  const target = formatAmount(task.target ?? 0);
  const progress =
    `Llevas ${formatAmount(task.value)} de ${target} ${task.unit ?? ""}`.trim();
  return {
    id: `${TASK_PREFIX}${task.id}.${moment}`,
    at,
    title: task.name,
    body: task.type === "boolean" ? text : `${text}. ${progress}`,
    habitId: null,
    taskId: task.id,
    category: moment === "due" ? null : taskCategoryOf(task).id,
  };
}

/**
 * The window of notifications (ADR-0005): the reminders and the digests together, soonest
 * first and as many as fit. At the same minute, reminders go first.
 */
export function windowOf(
  reminders: readonly PlannedNotification[],
  digests: readonly PlannedNotification[],
): PlannedNotification[] {
  const moment = ({ at }: PlannedNotification) => `${at.date} ${at.time}`;
  // Array.prototype.sort is stable, so reminders stay before digests at the same minute.
  return [...reminders, ...digests]
    .sort((a, b) =>
      moment(a) < moment(b) ? -1 : moment(a) > moment(b) ? 1 : 0,
    )
    .slice(0, MAX_UPCOMING_REMINDERS);
}

/**
 * The notification of a reminder snoozed until `at` (RF-25). Whoever snoozes it has just used
 * a button, so it no longer explains how to reach them.
 */
export function snoozedNotification(
  original: PlannedNotification,
  at: LocalDateTime,
): PlannedNotification {
  return {
    ...original,
    id: `${SNOOZE_PREFIX}${original.habitId}.${at.date}.${at.time}`,
    at,
    body: withoutGestureHint(original.body),
  };
}

/** Two notifications are the same if they would warn at the same moment in the same way. */
export function signatureOf(notification: PlannedNotification): string {
  const { at, title, body, category } = notification;
  return JSON.stringify([at.date, at.time, title, body, category]);
}

/** What the device has to have scheduled now. */
export interface ReminderPlan {
  /** The reminders and pending digests of the window, soonest first (ADR-0005, RF-37). */
  readonly notifications: readonly PlannedNotification[];
  /** The categories those reminders use. */
  readonly categories: readonly NotificationCategory[];
  readonly today: LocalDate;
  /** The habits still pending today: their snoozed reminders still have to warn (RF-24). */
  readonly pendingToday: ReadonlySet<string>;
  /** The day the gesture hint starts counting from, to remember it (RF-25). */
  readonly gestureHintStartedOn: LocalDate | null;
}

export async function planReminders(
  db: Database,
  now: LocalDateTime,
  gestureHint: GestureHint = NO_GESTURE_HINT,
): Promise<ReminderPlan> {
  const [habits, versions, entries, reminders, tasks] = await Promise.all([
    listHabits(db),
    listHabitVersions(db),
    listEntries(db, now.date, LAST_DATE),
    listReminders(db),
    listTasks(db),
  ]);
  const data = { habits, versions, entries, reminders, tasks };
  const upcoming = upcomingReminders(data, now);
  const digests = upcomingPendingDigests(data, now);
  const taskAlerts = upcomingTaskAlerts(tasks, now);

  const categories = new Map<string, NotificationCategory>();
  for (const { dayHabit } of upcoming) {
    const category = categoryOfDay(dayHabit);
    if (!categories.has(category.id)) categories.set(category.id, category);
  }
  for (const { task, moment } of taskAlerts) {
    if (moment === "due") continue;
    const category = taskCategoryOf(task);
    if (!categories.has(category.id)) categories.set(category.id, category);
  }
  const pendingToday = habitsForDay({ habits, versions, entries }, now.date)
    .filter((dayHabit) => !dayHabit.done)
    .map((dayHabit) => dayHabit.habit.id);

  // It starts counting with the first reminder, not on installing the app.
  const gestureHintStartedOn = gestureHint.learned
    ? gestureHint.startedOn
    : (gestureHint.startedOn ?? upcoming[0]?.date ?? null);
  const hint = { ...gestureHint, startedOn: gestureHintStartedOn };

  return {
    notifications: windowOf(
      [
        ...upcoming.map((reminder) => notificationOf(reminder, hint)),
        ...taskAlerts.map(taskAlertNotification),
      ],
      digests.map(digestNotification),
    ),
    categories: [...categories.values()],
    today: now.date,
    pendingToday: new Set(pendingToday),
    gestureHintStartedOn,
  };
}

/** The habit and day of a snoozed notification, from its identifier. */
function snoozedHabitAndDay(id: string): { habitId: string; date: string } {
  const [, habitId, date] = id.split(".");
  return { habitId, date };
}

/**
 * Brings the device in line with the plan:
 * - Registers the categories that are new or have changed. `knownCategories` remembers those
 *   already registered, by identifier, across calls.
 * - Cancels the snoozed reminders of habits no longer pending, and those of other days.
 * - Cancels the reminders and digests that have left the window, and schedules those that are
 *   missing or have changed. A changed one is replaced without cancelling it first: iOS may
 *   suspend the app halfway through, and it must not be left without its reminders.
 */
export async function syncNotifications(
  notifier: Notifier,
  plan: ReminderPlan,
  knownCategories: Map<string, string> = new Map(),
): Promise<void> {
  for (const category of plan.categories) {
    const signature = JSON.stringify(category.buttons);
    if (knownCategories.get(category.id) !== signature) {
      await notifier.setCategory(category);
      knownCategories.set(category.id, signature);
    }
  }

  const scheduled = await notifier.scheduled();

  for (const { id } of scheduled) {
    if (!id.startsWith(SNOOZE_PREFIX)) continue;
    const { habitId, date } = snoozedHabitAndDay(id);
    if (date !== plan.today || !plan.pendingToday.has(habitId)) {
      await notifier.cancel(id);
    }
  }

  const wanted = new Map(plan.notifications.map((n) => [n.id, signatureOf(n)]));
  const kept = new Set<string>();
  for (const notification of scheduled) {
    const { id } = notification;
    if (
      ![REMINDER_PREFIX, DIGEST_PREFIX, TASK_PREFIX].some((p) =>
        id.startsWith(p),
      )
    ) {
      continue;
    }
    if (wanted.get(id) === notification.signature) {
      kept.add(id);
    } else if (!wanted.has(id)) {
      await notifier.cancel(id);
    }
  }
  for (const notification of plan.notifications) {
    if (!kept.has(notification.id)) {
      await notifier.schedule(notification, signatureOf(notification));
    }
  }
}

/**
 * Runs `task` one call at a time. Calls made while one is waiting to start share it, so a
 * burst of changes (several quick taps) refreshes the reminders once more, not once per tap.
 */
export function serialized(task: () => Promise<void>): () => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  let waiting: Promise<void> | null = null;

  return () => {
    if (waiting !== null) return waiting;
    const next = tail.then(() => {
      waiting = null;
      return task();
    });
    waiting = next;
    tail = next.catch(() => undefined);
    return next;
  };
}
