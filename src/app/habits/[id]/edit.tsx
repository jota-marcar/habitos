// The form to edit a habit (RF-08), presented as a modal. It is opened from the options of
// the habit (RF-34), on any day it appears. The changes apply from today onwards, or from the
// day the habit starts if it has not started yet (RF-09), and the form says so when it was
// opened from another day.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  listHabitVersions,
  listHabits,
  saveHabitChanges,
} from "@/data/habits-repository";
import { listReminders } from "@/data/reminders-repository";
import { changesApplyFrom, versionOn } from "@/domain/habits";
import { newId, today } from "@/ui/clock";
import { useDatabase } from "@/ui/database";
import { formatFullDate } from "@/ui/format";
import {
  buildHabitChanges,
  habitFormOf,
  type HabitFormValues,
  type StoredHabit,
} from "@/ui/habit-form";
import { HabitFormScreen } from "@/ui/habit-form-screen";

export default function EditHabit() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const db = useDatabase();
  const router = useRouter();
  const [stored, setStored] = useState<StoredHabit | null>(null);
  const [initialValues, setInitialValues] = useState<HabitFormValues | null>(
    null,
  );

  useEffect(() => {
    let left = false;
    const read = async () => {
      const [habits, versions, reminders] = await Promise.all([
        listHabits(db),
        listHabitVersions(db),
        listReminders(db),
      ]);
      if (left) return;

      const habit = habits.find((h) => h.id === id);
      const own = versions.filter((v) => v.habitId === id);
      // The version to edit is the one the changes replace.
      const current =
        habit === undefined
          ? null
          : versionOn(own, changesApplyFrom(habit, today()));
      // There is nothing to edit if the habit is gone or archived (RF-10).
      if (habit === undefined || habit.archivedOn !== null || !current) {
        router.back();
        return;
      }
      const ownReminders = reminders.filter((r) => r.habitId === id);
      setStored({ habit, versions: own, reminders: ownReminders });
      setInitialValues(habitFormOf(habit, current, ownReminders));
    };
    void read();
    return () => {
      left = true;
    };
  }, [db, id, router]);

  if (stored === null || initialValues === null) return null;

  const from = changesApplyFrom(stored.habit, today());

  const save = async (values: HabitFormValues) => {
    const result = buildHabitChanges(stored, values, newId, today());
    if (!result.ok) return result.errors;
    await saveHabitChanges(db, result.changes);
    return [];
  };

  return (
    <HabitFormScreen
      initialValues={initialValues}
      editing
      note={
        day === undefined || day === from
          ? undefined
          : from === today()
            ? "Los cambios se aplican desde hoy"
            : `Los cambios se aplican desde el ${formatFullDate(from)}`
      }
      onSubmit={save}
    />
  );
}
