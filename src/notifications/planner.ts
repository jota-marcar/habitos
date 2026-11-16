// The reminder planner: keeps the local notifications of iOS in line with the reminders that
// have to warn next (ADR-0005). The domain decides which ones; this module turns them into
// notifications and only schedules or cancels what changed, so that frequent refreshes (one
// after every change) stay cheap.

import type { Database } from "@/data/database";
import { listEntries } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { localDate, localDateOf } from "@/domain/dates";
import { upcomingReminders, type UpcomingReminder } from "@/domain/reminders";
import { localTimeOf, type LocalDateTime } from "@/domain/times";
import { formatAmount } from "@/ui/format";

import type { Notifier, PlannedNotification } from "./notifier";

/** Every notification of the window has an identifier that starts like this. */
export const REMINDER_PREFIX = "reminder.";

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
  };
}

/** Two notifications are the same if they would warn at the same moment with the same text. */
export function signatureOf(notification: PlannedNotification): string {
  const { at, title, body } = notification;
  return JSON.stringify([at.date, at.time, title, body]);
}

/** The notifications that have to be scheduled now, soonest first (ADR-0005). */
export async function plannedNotifications(
  db: Database,
  now: LocalDateTime,
): Promise<PlannedNotification[]> {
  const [habits, versions, entries, reminders] = await Promise.all([
    listHabits(db),
    listHabitVersions(db),
    listEntries(db, now.date, LAST_DATE),
    listReminders(db),
  ]);
  return upcomingReminders({ habits, versions, entries, reminders }, now).map(
    notificationOf,
  );
}

/**
 * Brings the scheduled reminders in line with the planned ones: cancels those that no longer
 * warn or have changed, and schedules the missing ones. Other notifications (the snoozed
 * ones) are left alone.
 */
export async function syncNotifications(
  notifier: Notifier,
  planned: readonly PlannedNotification[],
): Promise<void> {
  const scheduled = (await notifier.scheduled()).filter((n) =>
    n.id.startsWith(REMINDER_PREFIX),
  );
  const wanted = new Map(planned.map((n) => [n.id, signatureOf(n)]));
  const kept = new Set<string>();

  for (const notification of scheduled) {
    if (wanted.get(notification.id) === notification.signature) {
      kept.add(notification.id);
    } else {
      await notifier.cancel(notification.id);
    }
  }
  for (const notification of planned) {
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
