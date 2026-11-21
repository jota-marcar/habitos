// The day on screen, which the calendar changes (RF-18), its habits and how to change them:
// recording them (RF-12 to RF-16) and the options of each one (RF-34). It reads the database
// when a day is shown and again after each change it makes (ADR-0010).
//
// The groups (pending and done) and their order are computed when the day is shown, at the
// time it is shown if it is the current day, and then kept while it stays on screen, so the
// list does not move under the finger when a habit is marked (RF-12). Only after a pause in the
// taps do the habits that were done or undone move to their group, where the screen animates
// them.

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { listEntries, saveEntry } from "@/data/entries-repository";
import {
  deleteHabit,
  listHabitVersions,
  listHabits,
  saveHabit,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import type { LocalDate } from "@/domain/dates";
import { habitsForDay, isDone, type DayHabit } from "@/domain/day";
import {
  canRecordOn,
  decremented,
  incremented,
  toggled,
} from "@/domain/entries";
import { archiveHabit } from "@/domain/habits";
import { localTimeOf } from "@/domain/times";
import {
  keepGroups,
  settleGroups,
  sortDayHabits,
  type DayGroups,
} from "@/domain/order";
import { onReminderRecorded } from "@/notifications/actions";
import { refreshReminders } from "@/notifications/reminders";
import { onSyncedChanges, syncSoon } from "@/sync/app-sync";

import { msUntilTomorrow, newId, now, today } from "./clock";
import { useDatabase } from "./database";
import { playRecorded, recordedFeedback } from "./haptics";

export interface Day {
  /** The day on screen. */
  readonly date: LocalDate;
  /** The current day, which changes at midnight. */
  readonly today: LocalDate;
  /** Shows another day (RF-18), or the current one again (RF-21). */
  readonly select: (date: LocalDate) => void;
  /** Its habits in the groups and order of the screen, or null while they are being read. */
  readonly habits: DayGroups<DayHabit> | null;
  /** Whether there is any habit at all, on this day or not. */
  readonly hasAnyHabit: boolean;
  /** Marks or unmarks a boolean habit, or adds the increment to a quantitative one. */
  readonly record: (habitId: string) => Promise<void>;
  /** Subtracts the increment from a quantitative habit (RF-15). */
  readonly decrement: (habitId: string) => Promise<void>;
  /** Replaces what a quantitative habit has accumulated with an exact amount (RF-15). */
  readonly setAmount: (habitId: string, amount: number) => Promise<void>;
  /** Archives a habit as of today (RF-10). */
  readonly archive: (habitId: string) => Promise<void>;
  /** Deletes a habit with all its history (RF-11). */
  readonly remove: (habitId: string) => Promise<void>;
}

const habitIdOf = (dayHabit: DayHabit) => dayHabit.habit.id;

/**
 * How long the list waits after the last change made on it before moving the habits that were
 * done or undone to their group (RF-12): enough to see the habit marked, and to tap it again
 * without it going away.
 */
export const SETTLE_DELAY_MS = 1000;

export function useDay(): Day {
  const db = useDatabase();
  const [date, setDate] = useState(today);
  const [currentDay, setCurrentDay] = useState(today);
  // The same two days, for what happens outside a render: timers and the state of the app.
  const shown = useRef(date);
  const current = useRef(currentDay);
  const [habits, setHabits] = useState<DayGroups<DayHabit> | null>(null);
  const [hasAnyHabit, setHasAnyHabit] = useState(false);
  // The groups computed when the day was shown, as habit ids.
  const order = useRef<DayGroups<string> | null>(null);
  // Changes are written one after another, so that quick taps do not overwrite each other.
  const writes = useRef<Promise<void>>(Promise.resolve());
  // Discards the reads that finish after a newer one has started.
  const lastRead = useRef(0);
  // The pause after the last change, and whether it is over: the next read then moves the
  // habits to their group.
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settleDue = useRef(false);

  const holdSettling = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleDue.current = false;
  }, []);

  const load = useCallback(
    async (shownDate: LocalDate, sort: boolean) => {
      const read = ++lastRead.current;
      const [allHabits, versions, entries, reminders] = await Promise.all([
        listHabits(db),
        listHabitVersions(db),
        listEntries(db, shownDate, shownDate),
        listReminders(db),
      ]);
      if (read !== lastRead.current) return;

      const dayHabits = habitsForDay(
        { habits: allHabits, versions, entries },
        shownDate,
      );
      // The current day is sorted by what is overdue and what comes next; any other day, by
      // the first reminders (RF-12).
      const time = shownDate === today() ? localTimeOf(now()) : null;
      if (sort || order.current === null) {
        const sorted = sortDayHabits(dayHabits, reminders, time);
        order.current = {
          pending: sorted.pending.map(habitIdOf),
          done: sorted.done.map(habitIdOf),
        };
        setHabits(sorted);
      } else {
        if (settleDue.current) {
          order.current = settleGroups(
            dayHabits,
            order.current,
            reminders,
            time,
          );
          settleDue.current = false;
        }
        setHabits(keepGroups(dayHabits, habitIdOf, order.current));
      }
      setHasAnyHabit(allHabits.some((h) => h.archivedOn === null));
    },
    [db],
  );

  const checkToday = useCallback(() => {
    current.current = today();
    setCurrentDay(current.current);
    return current.current;
  }, []);

  // Showing a day sorts it (RF-12): when it is chosen in the calendar, when the screen gains
  // focus and when the app comes back from the background.
  const show = useCallback(
    (day: LocalDate) => {
      holdSettling();
      checkToday();
      shown.current = day;
      setDate(day);
      void load(day, true);
    },
    [checkToday, holdSettling, load],
  );

  // A pending pause does not outlive the screen.
  useEffect(() => holdSettling, [holdSettling]);

  // Gaining focus is opening the app, which starts on the current day, and coming back from a
  // form, which keeps the day that was on screen.
  useFocusEffect(useCallback(() => show(shown.current), [show]));

  useEffect(() => {
    // Coming back to the app shows the current day, whatever day was on screen: looking at
    // other days is occasional (RF-18). Opening the Control Center makes the app inactive, but
    // it has not been left: only a return from the background counts.
    let wasInBackground = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") wasInBackground = true;
      if (state === "active" && wasInBackground) {
        wasInBackground = false;
        show(today());
      }
    });
    return () => subscription.remove();
  }, [show]);

  useEffect(() => {
    // With the app left open on the current day, the screen follows the clock past midnight
    // (RF-12). Another day stays on screen, although it may now be the current one. The timer
    // is set again every time: iOS holds it while the app is in the background, and a timer
    // that fires early finds the same day and just waits for what is left.
    let timer: ReturnType<typeof setTimeout>;
    const waitForTomorrow = () => {
      timer = setTimeout(() => {
        const wasOnToday = shown.current === current.current;
        const newDay = checkToday();
        if (wasOnToday) show(newDay);
        waitForTomorrow();
      }, msUntilTomorrow());
    };
    waitForTomorrow();
    return () => clearTimeout(timer);
  }, [checkToday, show]);

  // A button of a reminder may record something while the day is on screen (RF-25): it is
  // read again without sorting it, like any other change.
  useEffect(
    () => onReminderRecorded(() => void load(shown.current, false)),
    [load],
  );

  // So may a synchronization, with what changed on another device (RF-05).
  useEffect(
    () => onSyncedChanges(() => void load(shown.current, false)),
    [load],
  );

  // Makes a change after the ones before it and reads the day again, without sorting it.
  const change = useCallback(
    (make: () => Promise<void>): Promise<void> => {
      const write = writes.current.then(async () => {
        await make();
        // Marking a habit done cancels its pending reminders of the day (RF-24); archiving
        // or deleting it, all of them.
        void refreshReminders(db);
        syncSoon(db);
        await load(date, false);
      });
      // A failed write is reported to the caller but does not block the next ones.
      writes.current = write.catch(() => undefined);
      return write;
    },
    [db, date, load],
  );

  // Records the value that `next` gives for a habit of the day on screen. Each change holds the
  // habits in their places and starts the pause again, once it is written; when the pause is
  // over, the day is read again and they move to their group. A tap on the list (`withHaptics`)
  // is felt as soon as its value is known, before it is written.
  const setValue = useCallback(
    (
      habitId: string,
      next: (dayHabit: DayHabit) => number,
      withHaptics = false,
    ): Promise<void> => {
      holdSettling();
      const write = change(async () => {
        if (!canRecordOn(date, today())) return;
        const [allHabits, versions, entries] = await Promise.all([
          listHabits(db),
          listHabitVersions(db),
          listEntries(db, date, date),
        ]);
        const dayHabit = habitsForDay(
          { habits: allHabits, versions, entries },
          date,
        ).find((d) => d.habit.id === habitId);
        if (dayHabit === undefined) return;

        const value = next(dayHabit);
        if (withHaptics) {
          const { habit, version } = dayHabit;
          playRecorded(
            recordedFeedback(dayHabit.done, isDone(habit.type, version, value)),
          );
        }
        const existing = entries.find((e) => e.habitId === habitId);
        await saveEntry(db, {
          id: existing?.id ?? newId(),
          habitId,
          date,
          value,
        });
      });
      void write.then(() => {
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleDue.current = true;
          void load(shown.current, false);
        }, SETTLE_DELAY_MS);
      }, holdSettling);
      return write;
    },
    [db, date, change, holdSettling, load],
  );

  const record = useCallback(
    (habitId: string) =>
      setValue(
        habitId,
        ({ habit, version, value }) =>
          habit.type === "boolean"
            ? toggled(value)
            : incremented(value, version.increment ?? 0),
        true,
      ),
    [setValue],
  );

  const decrement = useCallback(
    (habitId: string) =>
      setValue(habitId, ({ version, value }) =>
        decremented(value, version.increment ?? 0),
      ),
    [setValue],
  );

  const setAmount = useCallback(
    (habitId: string, amount: number) => setValue(habitId, () => amount),
    [setValue],
  );

  const archive = useCallback(
    (habitId: string) =>
      change(async () => {
        const habit = (await listHabits(db)).find((h) => h.id === habitId);
        if (habit !== undefined) {
          await saveHabit(db, archiveHabit(habit, today()));
        }
      }),
    [db, change],
  );

  const remove = useCallback(
    (habitId: string) => change(() => deleteHabit(db, habitId)),
    [db, change],
  );

  return {
    date,
    today: currentDay,
    select: show,
    habits,
    hasAnyHabit,
    record,
    decrement,
    setAmount,
    archive,
    remove,
  };
}
