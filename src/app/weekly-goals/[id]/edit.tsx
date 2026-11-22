// The form to edit a weekly goal (RF-43), presented as a modal. It is opened from the options of
// the goal (RF-50), in any week it appears. The amounts apply from the current week, or from its
// first week if it has not started, and the form says so when it was opened from another week.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  listWeeklyGoalVersions,
  listWeeklyGoals,
  saveWeeklyGoalChanges,
} from "@/data/weekly-goals-repository";
import { parseLocalDate } from "@/domain/dates";
import { versionOn } from "@/domain/habits";
import {
  canEditWeeklyGoal,
  weeklyGoalChangesApplyFrom,
  type WeeklyGoal,
  type WeeklyGoalVersion,
} from "@/domain/weekly-goals";
import { weekOf } from "@/domain/weeks";
import { newId, today } from "@/ui/clock";
import { useDatabase } from "@/ui/database";
import { formatWeekRange } from "@/ui/format";
import {
  buildWeeklyGoalChanges,
  weeklyGoalFormOf,
  type WeeklyGoalFormValues,
} from "@/ui/weekly-goal-form";
import { WeeklyGoalFormScreen } from "@/ui/weekly-goal-form-screen";

interface Stored {
  readonly goal: WeeklyGoal;
  readonly versions: readonly WeeklyGoalVersion[];
  readonly initialValues: WeeklyGoalFormValues;
}

export default function EditWeeklyGoal() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const db = useDatabase();
  const router = useRouter();
  const [stored, setStored] = useState<Stored | null>(null);

  useEffect(() => {
    let left = false;
    const read = async () => {
      const [goals, versions] = await Promise.all([
        listWeeklyGoals(db),
        listWeeklyGoalVersions(db),
      ]);
      if (left) return;

      const goal = goals.find((g) => g.id === id);
      const own = versions.filter((v) => v.weeklyGoalId === id);
      // The version to edit is the one the changes replace.
      const current =
        goal === undefined
          ? null
          : versionOn(own, weeklyGoalChangesApplyFrom(goal, today()));
      // There is nothing to edit if the goal is gone or can no longer change (RF-43).
      if (
        goal === undefined ||
        current === null ||
        !canEditWeeklyGoal(goal, today())
      ) {
        router.back();
        return;
      }
      setStored({
        goal,
        versions: own,
        initialValues: weeklyGoalFormOf(goal, current),
      });
    };
    void read();
    return () => {
      left = true;
    };
  }, [db, id, router]);

  if (stored === null) return null;

  const from = weeklyGoalChangesApplyFrom(stored.goal, today());
  const shownDay = day === undefined ? null : parseLocalDate(day);
  const shownWeek = shownDay === null ? from : weekOf(shownDay).start;

  const save = async (values: WeeklyGoalFormValues) => {
    const result = buildWeeklyGoalChanges(stored, values, newId, today());
    if (!result.ok) return result.errors;
    await saveWeeklyGoalChanges(db, result.goal, result.version);
    return [];
  };

  return (
    <WeeklyGoalFormScreen
      initialValues={stored.initialValues}
      note={
        shownWeek === from
          ? undefined
          : from === weekOf(today()).start
            ? "Los cambios se aplican desde esta semana"
            : `Los cambios se aplican desde la semana del ${formatWeekRange(weekOf(from), today())}`
      }
      onSubmit={save}
    />
  );
}
