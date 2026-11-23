// The form to create a habit (RF-06), presented as a modal. It is told the day on screen when it
// was opened: a habit created from a future day starts that day, and the form says so.

import { useLocalSearchParams } from "expo-router";

import { addHabit } from "@/data/habits-repository";
import { parseLocalDate } from "@/domain/dates";
import { startOfNewHabit } from "@/domain/habits";
import { newId, today } from "@/shared/clock";
import { useDatabase } from "@/ui/database";
import { showDayOnReturn } from "@/ui/day-on-return";
import { formatFullDate } from "@/shared/format";
import {
  EMPTY_HABIT_FORM,
  buildHabit,
  type HabitFormValues,
} from "@/ui/habit-form";
import { HabitFormScreen } from "@/ui/habit-form-screen";

export default function NewHabit() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const db = useDatabase();
  const shown = (day === undefined ? null : parseLocalDate(day)) ?? today();
  const start = startOfNewHabit(shown, today());

  const create = async (values: HabitFormValues) => {
    // The start is computed again: the form may have stayed open past midnight.
    const startsOn = startOfNewHabit(shown, today());
    const result = buildHabit(values, newId, startsOn);
    if (!result.ok) return result.errors;
    await addHabit(db, result.habit, result.version, result.reminders);
    // Created from a past day, it is not there: the screen goes to the day it starts.
    if (startsOn !== shown) showDayOnReturn(startsOn);
    return [];
  };

  return (
    <HabitFormScreen
      initialValues={EMPTY_HABIT_FORM}
      note={
        start === today() ? undefined : `Empieza el ${formatFullDate(start)}`
      }
      onSubmit={create}
    />
  );
}
