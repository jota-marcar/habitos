// The goals of the week on screen and how to change them (RF-46, RF-47, RF-50). How the list is
// read, kept in place and recorded is common to every page (`use-tracked-page`); a week groups
// its goals without an order of its own.

import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";

import {
  deleteWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoalVersions,
  listWeeklyGoals,
  saveWeeklyGoal,
  saveWeeklyGoalEntry,
} from "@/data/weekly-goals-repository";
import type { LocalDate } from "@/domain/dates";
import {
  groupWeekGoals,
  settleWeekGoals,
  type DayGroups,
} from "@/domain/order";
import {
  archiveWeeklyGoal,
  canEditWeeklyGoal,
  goalsForWeek,
  type WeekGoal,
} from "@/domain/weekly-goals";
import { weekOf } from "@/domain/weeks";

import { newId, today } from "@/shared/clock";
import { useDatabase } from "./database";
import { useTrackedPage, type PageSource } from "./use-tracked-page";

export interface WeekPage {
  /** Its goals in the groups and order of the screen, or null while they are being read. */
  readonly goals: DayGroups<WeekGoal> | null;
  /** Whether any goal is still in force, in this week or not: like the habits, not archived. */
  readonly hasAnyGoal: boolean;
  /** Marks or unmarks a yes-or-no goal, or adds the increment to one with an amount (RF-47). */
  readonly record: (goalId: string) => Promise<void>;
  /** Subtracts the increment from a goal with an amount (RF-50). */
  readonly decrement: (goalId: string) => Promise<void>;
  /** Replaces the total of a goal with an exact amount (RF-50). */
  readonly setAmount: (goalId: string, amount: number) => Promise<void>;
  /** Archives a recurring goal as of the current week (RF-44). */
  readonly archive: (goalId: string) => Promise<void>;
  /** Deletes a goal with all its history (RF-45). */
  readonly remove: (goalId: string) => Promise<void>;
}

/** The page of the week that starts on the Monday `monday`. */
export function useWeek(monday: LocalDate): WeekPage {
  const db = useDatabase();

  const source = useMemo<PageSource<WeekGoal>>(
    () => ({
      idOf: (weekGoal) => weekGoal.goal.id,
      progressOf: ({ goal, version, value, done }) => ({
        type: goal.type,
        amounts: version,
        value,
        done,
      }),
      read: async (week) => {
        const [allGoals, versions, entries] = await Promise.all([
          listWeeklyGoals(db),
          listWeeklyGoalVersions(db),
          listWeeklyGoalEntries(db, week),
        ]);
        const weekGoals = goalsForWeek(
          { goals: allGoals, versions, entries },
          weekOf(week),
        );
        const currentDay = today();
        return {
          items: weekGoals,
          // Like the habits, a goal still counts while it can be edited: not archived.
          hasAny: allGoals.some((g) => canEditWeeklyGoal(g, currentDay)),
          group: () => groupWeekGoals(weekGoals),
          settle: (order) => settleWeekGoals(weekGoals, order),
          save: async ({ goal }, value) => {
            const existing = entries.find((e) => e.weeklyGoalId === goal.id);
            await saveWeeklyGoalEntry(db, {
              id: existing?.id ?? newId(),
              weeklyGoalId: goal.id,
              week,
              value,
            });
          },
        };
      },
    }),
    [db],
  );
  const page = useTrackedPage(source, monday);
  const { show, change } = page;

  // Showing a week groups its goals: when it changes and when the screen gains focus, which
  // includes coming back from a form.
  useFocusEffect(useCallback(() => show(monday), [show, monday]));

  const archive = useCallback(
    (goalId: string) =>
      change(async () => {
        const goal = (await listWeeklyGoals(db)).find((g) => g.id === goalId);
        if (goal !== undefined) {
          await saveWeeklyGoal(db, archiveWeeklyGoal(goal, today()));
        }
      }),
    [db, change],
  );

  const remove = useCallback(
    (goalId: string) => change(() => deleteWeeklyGoal(db, goalId)),
    [db, change],
  );

  return {
    goals: page.items,
    hasAnyGoal: page.hasAny,
    record: page.record,
    decrement: page.decrement,
    setAmount: page.setAmount,
    archive,
    remove,
  };
}
