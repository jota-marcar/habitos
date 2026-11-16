// What the buttons of a reminder do, without opening the app (RF-25): mark a boolean habit
// done, add the increment to a quantitative one, or snooze the reminder for an hour. Tapping
// the reminder itself only opens the app, which shows the current day (RF-26).

import type { Database } from "@/data/database";
import { listEntries, saveEntry } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { habitsForDay } from "@/domain/day";
import { canRecordOn, incremented } from "@/domain/entries";
import { snoozedTime } from "@/domain/reminders";
import type { LocalDateTime } from "@/domain/times";

import type { Notifier, ReminderResponse } from "./notifier";
import { BUTTONS, signatureOf, snoozedNotification } from "./planner";

/**
 * Does what the user asked from a reminder at `now`. Returns whether something was recorded,
 * so that the screen on display can show it.
 */
export async function answerReminder(
  db: Database,
  notifier: Notifier,
  { buttonId, notification }: ReminderResponse,
  now: LocalDateTime,
  newId: () => string,
): Promise<boolean> {
  if (buttonId === BUTTONS.snooze) {
    // A reminder never leaves the day of its habit (RF-25).
    const time = snoozedTime(now.time);
    if (notification.at.date !== now.date || time === null) return false;
    const snoozed = snoozedNotification(notification, { date: now.date, time });
    await notifier.schedule(snoozed, signatureOf(snoozed));
    return false;
  }
  if (buttonId !== BUTTONS.done && buttonId !== BUTTONS.add) return false;

  const { date } = notification.at;
  if (!canRecordOn(date, now.date)) return false;
  const [habits, versions, entries] = await Promise.all([
    listHabits(db),
    listHabitVersions(db),
    listEntries(db, date, date),
  ]);
  // The habit may have been deleted or archived since the reminder was scheduled.
  const dayHabit = habitsForDay({ habits, versions, entries }, date).find(
    (d) => d.habit.id === notification.habitId,
  );
  if (dayHabit === undefined) return false;

  const { habit, version, value } = dayHabit;
  // Unlike a tap on the list, "Hecho" never unmarks a habit.
  const next =
    habit.type === "boolean" ? 1 : incremented(value, version.increment ?? 0);
  const existing = entries.find((e) => e.habitId === habit.id);
  await saveEntry(db, {
    id: existing?.id ?? newId(),
    habitId: habit.id,
    date,
    value: next,
  });
  return true;
}

const recordedListeners = new Set<() => void>();

/** Calls `listener` whenever a reminder records something. Returns how to stop. */
export function onReminderRecorded(listener: () => void): () => void {
  recordedListeners.add(listener);
  return () => recordedListeners.delete(listener);
}

export function notifyReminderRecorded(): void {
  recordedListeners.forEach((listener) => listener());
}
