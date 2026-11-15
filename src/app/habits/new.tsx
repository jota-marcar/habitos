// The form to create a habit (RF-06), presented as a modal.

import { addHabit } from "@/data/habits-repository";
import { newId, today } from "@/ui/clock";
import { useDatabase } from "@/ui/database";
import {
  EMPTY_HABIT_FORM,
  buildHabit,
  type HabitFormValues,
} from "@/ui/habit-form";
import { HabitFormScreen } from "@/ui/habit-form-screen";

export default function NewHabit() {
  const db = useDatabase();

  const create = async (values: HabitFormValues) => {
    const result = buildHabit(values, newId, today());
    if (!result.ok) return result.errors;
    await addHabit(db, result.habit, result.version, result.reminders);
    return [];
  };

  return <HabitFormScreen initialValues={EMPTY_HABIT_FORM} onSubmit={create} />;
}
