// The form to create a weekly goal (RF-42), presented as a modal. It is told the day on screen
// when it was opened: a goal created from a future week starts that week, and one created from a
// past week starts in the current one, where the screen goes when it is saved.

import { useLocalSearchParams } from "expo-router";

import { addWeeklyGoal } from "@/data/weekly-goals-repository";
import { parseLocalDate } from "@/domain/dates";
import { firstWeekOfNewGoal } from "@/domain/weekly-goals";
import { weekOf } from "@/domain/weeks";
import { newId, today } from "@/shared/clock";
import { useDatabase } from "@/ui/database";
import { showDayOnReturn } from "@/ui/day-on-return";
import {
  EMPTY_WEEKLY_GOAL_FORM,
  buildWeeklyGoal,
  type WeeklyGoalFormValues,
} from "@/ui/weekly-goal-form";
import { WeeklyGoalFormScreen } from "@/ui/weekly-goal-form-screen";

export default function NewWeeklyGoal() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const db = useDatabase();
  const shown = (day === undefined ? null : parseLocalDate(day)) ?? today();

  const create = async (values: WeeklyGoalFormValues) => {
    // The first week is computed again: the form may have stayed open past Sunday.
    const firstWeek = firstWeekOfNewGoal(shown, today());
    const result = buildWeeklyGoal(values, newId, firstWeek);
    if (!result.ok) return result.errors;
    await addWeeklyGoal(db, result.goal, result.version);
    // Created from a past week, it is not there: the screen goes to the current one.
    if (firstWeek !== weekOf(shown).start) showDayOnReturn(today());
    return [];
  };

  return (
    <WeeklyGoalFormScreen
      initialValues={EMPTY_WEEKLY_GOAL_FORM}
      firstWeek={firstWeekOfNewGoal(shown, today())}
      onSubmit={create}
    />
  );
}
