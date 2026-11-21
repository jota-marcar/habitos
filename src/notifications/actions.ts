// What the buttons of a reminder do, without opening the app (RF-25): mark a boolean habit
// done, add the increment to a quantitative one, or snooze the reminder for an hour. Tapping
// the reminder itself only opens the app, which shows the current day (RF-26).

import type { Database } from "@/data/database";
import { listEntries, saveEntry } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listTasks, saveTask } from "@/data/tasks-repository";
import { habitsForDay } from "@/domain/day";
import { canRecordOn, incremented } from "@/domain/entries";
import { snoozedTime } from "@/domain/reminders";
import { recordTask } from "@/domain/tasks";
import type { LocalDateTime } from "@/domain/times";

import type { Notifier, ReminderResponse } from "./notifier";
import { BUTTONS, signatureOf, snoozedNotification } from "./planner";

/**
 * Records a task from the button of its alert (RF-45), which never unmarks it. The task may have
 * been deleted since the alert was scheduled, or be closed by now (RF-44).
 */
async function answerTaskAlert(
  db: Database,
  taskId: string,
  buttonId: string | null,
  now: LocalDateTime,
): Promise<boolean> {
  if (buttonId !== BUTTONS.done && buttonId !== BUTTONS.add) return false;
  const task = (await listTasks(db)).find(({ id }) => id === taskId);
  if (task === undefined) return false;
  const value =
    task.type === "boolean" ? 1 : incremented(task.value, task.increment ?? 0);
  const recorded = recordTask(task, value, now);
  if (recorded === null) return false;
  await saveTask(db, recorded);
  return true;
}

/**
 * Does what the user asked from a reminder or a task alert at `now`. Returns whether something
 * was recorded, so that the screen on display can show it.
 */
export async function answerReminder(
  db: Database,
  notifier: Notifier,
  { buttonId, notification }: ReminderResponse,
  now: LocalDateTime,
  newId: () => string,
): Promise<boolean> {
  if (notification.taskId !== undefined) {
    return answerTaskAlert(db, notification.taskId, buttonId, now);
  }
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
