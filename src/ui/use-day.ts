// The habits of the day on screen and how to record them (RF-12 to RF-16). It reads the
// database when the screen gains focus and when the app comes back from the background, and
// again after each change it makes (ADR-0010).
//
// The order is computed when the day is shown (pending first) and then kept while it stays on
// screen, so the list does not move under the finger when a habit is marked (RF-12).

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { listEntries, saveEntry } from "@/data/entries-repository";
import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import type { LocalDate } from "@/domain/dates";
import { habitsForDay, type DayHabit } from "@/domain/day";
import { canRecordOn, incremented, toggled } from "@/domain/entries";
import { keepOrder, sortDayHabits } from "@/domain/order";

import { newId, today } from "./clock";
import { useDatabase } from "./database";

export interface Day {
  /** The day on screen. */
  readonly date: LocalDate;
  /** Its habits in the order of the screen, or null while they are being read. */
  readonly habits: readonly DayHabit[] | null;
  /** Whether there is any habit at all, on this day or not. */
  readonly hasAnyHabit: boolean;
  /** Marks or unmarks a boolean habit, or adds the increment to a quantitative one. */
  readonly record: (habitId: string) => Promise<void>;
}

const habitIdOf = (dayHabit: DayHabit) => dayHabit.habit.id;

export function useDay(): Day {
  const db = useDatabase();
  const [date, setDate] = useState(today);
  const [habits, setHabits] = useState<readonly DayHabit[] | null>(null);
  const [hasAnyHabit, setHasAnyHabit] = useState(false);
  // The order computed when the day was shown, as habit ids.
  const order = useRef<readonly string[] | null>(null);
  // Changes are written one after another, so that quick taps do not overwrite each other.
  const writes = useRef<Promise<void>>(Promise.resolve());
  // Discards the reads that finish after a newer one has started.
  const lastRead = useRef(0);

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
      if (sort || order.current === null) {
        const sorted = sortDayHabits(dayHabits, reminders);
        order.current = sorted.map(habitIdOf);
        setHabits(sorted);
      } else {
        setHabits(keepOrder(dayHabits, habitIdOf, order.current));
      }
      setHasAnyHabit(allHabits.some((h) => h.archivedOn === null));
    },
    [db],
  );

  // Showing the day again sorts it: when the screen gains focus (opening the app, coming back
  // from a form) and when the app comes back from the background (RF-12). That is also when
  // the current day may have changed.
  const show = useCallback(() => {
    const current = today();
    setDate(current);
    void load(current, true);
  }, [load]);

  useFocusEffect(show);

  useEffect(() => {
    // Opening the Control Center makes the app inactive, but it has not been left: only a
    // return from the background counts.
    let wasInBackground = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") wasInBackground = true;
      if (state === "active" && wasInBackground) {
        wasInBackground = false;
        show();
      }
    });
    return () => subscription.remove();
  }, [show]);

  const record = useCallback(
    (habitId: string): Promise<void> => {
      const write = writes.current.then(async () => {
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

        const { habit, version, value } = dayHabit;
        const next =
          habit.type === "boolean"
            ? toggled(value)
            : incremented(value, version.increment ?? 0);
        const existing = entries.find((e) => e.habitId === habitId);
        await saveEntry(db, {
          id: existing?.id ?? newId(),
          habitId,
          date,
          value: next,
        });
        await load(date, false);
      });
      // A failed write is reported to the caller but does not block the next ones.
      writes.current = write.catch(() => undefined);
      return write;
    },
    [db, date, load],
  );

  return { date, habits, hasAnyHabit, record };
}
