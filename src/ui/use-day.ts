// The day on screen, which the calendar changes (RF-18), its habits and how to change them:
// recording them (RF-12 to RF-16) and the options of each one (RF-34). How the list is read,
// kept in place and recorded is common to every page (`use-tracked-page`); a day sorts its
// habits by their reminders, and follows the clock and the app coming back.

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { habitsForDay, type DayHabit } from "@/domain/day";
import { archiveHabit } from "@/domain/habits";
import { localTimeOf } from "@/domain/times";
import { settleGroups, sortDayHabits, type DayGroups } from "@/domain/order";
import { onReminderRecorded } from "@/notifications/actions";

import { msUntilTomorrow, newId, now, today } from "@/shared/clock";
import { useDatabase } from "./database";
import { takeDayOnReturn } from "./day-on-return";
import { useTrackedPage, type PageSource } from "./use-tracked-page";

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

export function useDay(): Day {
  const db = useDatabase();
  const [date, setDate] = useState(today);
  const [currentDay, setCurrentDay] = useState(today);
  // The same two days, for what happens outside a render: timers and the state of the app.
  const shown = useRef(date);
  const current = useRef(currentDay);

  const source = useMemo<PageSource<DayHabit>>(
    () => ({
      idOf: (dayHabit) => dayHabit.habit.id,
      progressOf: ({ habit, version, value, done }) => ({
        type: habit.type,
        amounts: version,
        value,
        done,
      }),
      read: async (day) => {
        const [allHabits, versions, entries, reminders] = await Promise.all([
          listHabits(db),
          listHabitVersions(db),
          listEntries(db, day, day),
          listReminders(db),
        ]);
        const dayHabits = habitsForDay(
          { habits: allHabits, versions, entries },
          day,
        );
        // The current day is sorted by what is overdue and what comes next; any other day, by
        // the first reminders (RF-12).
        const time = day === today() ? localTimeOf(now()) : null;
        return {
          items: dayHabits,
          hasAny: allHabits.some((h) => h.archivedOn === null),
          group: () => sortDayHabits(dayHabits, reminders, time),
          settle: (order) => settleGroups(dayHabits, order, reminders, time),
          save: async ({ habit }, value) => {
            const existing = entries.find((e) => e.habitId === habit.id);
            await saveEntry(db, {
              id: existing?.id ?? newId(),
              habitId: habit.id,
              date: day,
              value,
            });
          },
        };
      },
    }),
    [db],
  );
  const page = useTrackedPage(source, date);
  const { show: showPage, reload, change } = page;

  const checkToday = useCallback(() => {
    current.current = today();
    setCurrentDay(current.current);
    return current.current;
  }, []);

  // Showing a day sorts it (RF-12): when it is chosen in the calendar, when the screen gains
  // focus and when the app comes back from the background.
  const show = useCallback(
    (day: LocalDate) => {
      checkToday();
      shown.current = day;
      setDate(day);
      showPage(day);
    },
    [checkToday, showPage],
  );

  // Gaining focus is opening the app, which starts on the current day, and coming back from a
  // form, which keeps the day that was on screen unless it asks for another one.
  useFocusEffect(
    useCallback(() => show(takeDayOnReturn() ?? shown.current), [show]),
  );

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
  useEffect(() => onReminderRecorded(reload), [reload]);

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
    habits: page.items,
    hasAnyHabit: page.hasAny,
    record: page.record,
    decrement: page.decrement,
    setAmount: page.setAmount,
    archive,
    remove,
  };
}
