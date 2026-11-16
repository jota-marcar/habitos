// The reminder planner: keeps the local notifications of iOS in line with the reminders that
// have to warn next (ADR-0005). The domain decides which ones; this module turns them into
// notifications and only schedules or cancels what changed, so that frequent refreshes (one
// after every change) stay cheap.

import type { Database } from "@/data/database";
import { listEntries } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { localDate, localDateOf, type LocalDate } from "@/domain/dates";
import { habitsForDay, type DayHabit } from "@/domain/day";
import type { Habit } from "@/domain/habits";
import {
  SNOOZE_MINUTES,
  upcomingReminders,
  type UpcomingReminder,
} from "@/domain/reminders";
import { localTimeOf, type LocalDateTime } from "@/domain/times";
import { formatAmount } from "@/ui/format";

import type {
  NotificationButton,
  NotificationCategory,
  Notifier,
  PlannedNotification,
} from "./notifier";

/** Every notification of the window has an identifier that starts like this. */
export const REMINDER_PREFIX = "reminder.";

/** Every snoozed notification has an identifier that starts like this. */
export const SNOOZE_PREFIX = "snooze.";

/** The buttons of the reminders (RF-25). */
export const BUTTONS = { done: "done", add: "add", snooze: "snooze" } as const;

const BOOLEAN_CATEGORY = "reminder_boolean";
const QUANTITATIVE_CATEGORY_PREFIX = "reminder_add_";

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
): PlannedNotification {
  const { reminder, date, dayHabit } = upcoming;
  return {
    id: `${REMINDER_PREFIX}${reminder.id}.${date}`,
    at: { date, time: reminder.time },
    title: dayHabit.habit.name,
    body: reminderBody(upcoming),
    habitId: dayHabit.habit.id,
    category: categoryOf(dayHabit.habit),
  };
}

/** The notification of a reminder snoozed until `at` (RF-25). */
export function snoozedNotification(
  original: PlannedNotification,
  at: LocalDateTime,
): PlannedNotification {
  return {
    ...original,
    id: `${SNOOZE_PREFIX}${original.habitId}.${at.date}.${at.time}`,
    at,
  };
}

/** Two notifications are the same if they would warn at the same moment in the same way. */
export function signatureOf(notification: PlannedNotification): string {
  const { at, title, body, category } = notification;
  return JSON.stringify([at.date, at.time, title, body, category]);
}

/** What the device has to have scheduled now. */
export interface ReminderPlan {
  /** The reminders of the window, soonest first (ADR-0005). */
  readonly notifications: readonly PlannedNotification[];
  /** The categories those reminders use. */
  readonly categories: readonly NotificationCategory[];
  readonly today: LocalDate;
  /** The habits still pending today: their snoozed reminders still have to warn (RF-24). */
  readonly pendingToday: ReadonlySet<string>;
}

export async function planReminders(
  db: Database,
  now: LocalDateTime,
): Promise<ReminderPlan> {
  const [habits, versions, entries, reminders] = await Promise.all([
    listHabits(db),
    listHabitVersions(db),
    listEntries(db, now.date, LAST_DATE),
    listReminders(db),
  ]);
  const upcoming = upcomingReminders(
    { habits, versions, entries, reminders },
    now,
  );

  const categories = new Map<string, NotificationCategory>();
  for (const { dayHabit } of upcoming) {
    const category = categoryOfDay(dayHabit);
    if (!categories.has(category.id)) categories.set(category.id, category);
  }
  const pendingToday = habitsForDay({ habits, versions, entries }, now.date)
    .filter((dayHabit) => !dayHabit.done)
    .map((dayHabit) => dayHabit.habit.id);

  return {
    notifications: upcoming.map(notificationOf),
    categories: [...categories.values()],
    today: now.date,
    pendingToday: new Set(pendingToday),
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
 * - Cancels the reminders of the window that no longer warn or have changed, and schedules
 *   the missing ones.
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
    if (!notification.id.startsWith(REMINDER_PREFIX)) continue;
    if (wanted.get(notification.id) === notification.signature) {
      kept.add(notification.id);
    } else {
      await notifier.cancel(notification.id);
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
