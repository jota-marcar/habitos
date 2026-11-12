// The active habits with their current configuration and reminders, in the order of the day
// view (RF-07, RF-12). It reads the database each time the screen gains focus (ADR-0010).

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listHabitVersions, listHabits } from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { versionOn, type Habit, type HabitVersion } from "@/domain/habits";
import { sortByFirstReminder } from "@/domain/order";
import type { Reminder } from "@/domain/reminders";

import { today } from "./clock";
import { useDatabase } from "./database";

export interface ActiveHabit {
  readonly habit: Habit;
  /** The configuration in force today. */
  readonly version: HabitVersion;
  readonly reminders: readonly Reminder[];
}

/** The active habits, or null while they are being read. */
export function useActiveHabits(): readonly ActiveHabit[] | null {
  const db = useDatabase();
  const [habits, setHabits] = useState<readonly ActiveHabit[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void (async () => {
        const [all, versions, reminders] = await Promise.all([
          listHabits(db),
          listHabitVersions(db),
          listReminders(db),
        ]);
        const date = today();
        const active: ActiveHabit[] = [];
        for (const habit of all) {
          if (habit.archivedOn !== null) continue;
          const version = versionOn(
            versions.filter((v) => v.habitId === habit.id),
            date,
          );
          // Every habit has a version from the day it was created.
          if (version === null) continue;
          active.push({
            habit,
            version,
            reminders: reminders.filter((r) => r.habitId === habit.id),
          });
        }
        if (current) {
          setHabits(
            sortByFirstReminder(active, (item) => item.habit.id, reminders),
          );
        }
      })();
      return () => {
        current = false;
      };
    }, [db]),
  );

  return habits;
}
