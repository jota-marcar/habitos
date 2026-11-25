// The form to edit a long-term goal (RF-56), presented as a modal. It is opened from the options
// of the goal (RF-60), on any day it is in progress. The changes apply to the whole goal.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  listLongTermGoals,
  saveLongTermGoal,
} from "@/data/long-term-goals-repository";
import {
  canEditLongTermGoal,
  type LongTermGoal,
} from "@/domain/long-term-goals";
import { today } from "@/shared/clock";
import { useDatabase } from "@/ui/database";
import {
  buildLongTermGoalChanges,
  longTermGoalFormOf,
  type LongTermGoalFormValues,
} from "@/ui/long-term-goal-form";
import { LongTermGoalFormScreen } from "@/ui/long-term-goal-form-screen";

export default function EditLongTermGoal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const router = useRouter();
  const [goal, setGoal] = useState<LongTermGoal | null>(null);

  useEffect(() => {
    let left = false;
    const read = async () => {
      const found = (await listLongTermGoals(db)).find((g) => g.id === id);
      if (left) return;
      // There is nothing to edit if the goal is gone or its deadline has passed (RF-56).
      if (found === undefined || !canEditLongTermGoal(found, today())) {
        router.back();
        return;
      }
      setGoal(found);
    };
    void read();
    return () => {
      left = true;
    };
  }, [db, id, router]);

  if (goal === null) return null;

  const save = async (values: LongTermGoalFormValues) => {
    const result = buildLongTermGoalChanges(goal, values, today());
    if (!result.ok) return result.errors;
    await saveLongTermGoal(db, result.goal);
    return [];
  };

  return (
    <LongTermGoalFormScreen
      initialValues={longTermGoalFormOf(goal)}
      firstDay={goal.firstDay}
      editing
      onSubmit={save}
    />
  );
}
