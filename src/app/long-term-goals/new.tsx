// The form to create a long-term goal (RF-55), presented as a modal. It is told the day on screen
// when it was opened: a goal created from a future day starts that day, and one created from a
// past day starts on the current one, where the screen goes when it is saved.

import { useLocalSearchParams } from "expo-router";

import { saveLongTermGoal } from "@/data/long-term-goals-repository";
import { parseLocalDate } from "@/domain/dates";
import { firstDayOfNewLongTermGoal } from "@/domain/long-term-goals";
import { newId, today } from "@/shared/clock";
import { useDatabase } from "@/ui/database";
import { showDayOnReturn } from "@/ui/day-on-return";
import {
  EMPTY_LONG_TERM_GOAL_FORM,
  buildLongTermGoal,
  type LongTermGoalFormValues,
} from "@/ui/long-term-goal-form";
import { LongTermGoalFormScreen } from "@/ui/long-term-goal-form-screen";

export default function NewLongTermGoal() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const db = useDatabase();
  const shown = (day === undefined ? null : parseLocalDate(day)) ?? today();

  const create = async (values: LongTermGoalFormValues) => {
    // The first day is computed again: the form may have stayed open past midnight.
    const currentDay = today();
    const firstDay = firstDayOfNewLongTermGoal(shown, currentDay);
    const result = buildLongTermGoal(values, newId(), firstDay, currentDay);
    if (!result.ok) return result.errors;
    await saveLongTermGoal(db, result.goal);
    // Created from a past day, it is not there: the screen goes to the current one.
    if (firstDay !== shown) showDayOnReturn(currentDay);
    return [];
  };

  return (
    <LongTermGoalFormScreen
      initialValues={EMPTY_LONG_TERM_GOAL_FORM}
      firstDay={firstDayOfNewLongTermGoal(shown, today())}
      onSubmit={create}
    />
  );
}
