// The long-term goals in progress on the day on screen and how to change them (RF-58 to RF-60).
// How the list is read, kept in place and recorded is common to every page (`use-tracked-page`);
// the goals come in the order of their deadlines, which the groups keep.

import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";

import {
  deleteLongTermGoal,
  listLongTermGoalEntries,
  listLongTermGoals,
  saveLongTermGoalEntry,
} from "@/data/long-term-goals-repository";
import type { LocalDate } from "@/domain/dates";
import {
  canEditLongTermGoal,
  longTermGoalsForDay,
  type DayLongTermGoal,
} from "@/domain/long-term-goals";
import { groupGoals, settleGoals, type DayGroups } from "@/domain/order";

import { newId, today } from "@/shared/clock";
import { useDatabase } from "./database";
import { useTrackedPage, type PageSource } from "./use-tracked-page";

export interface LongTermGoalsPage {
  /** Its goals in the groups and order of the screen, or null while they are being read. */
  readonly goals: DayGroups<DayLongTermGoal> | null;
  /** Whether any goal is still in force, on this day or not: one that has not ended. */
  readonly hasAnyGoal: boolean;
  /** Marks or unmarks a yes-or-no goal, or adds the increment to one with an amount (RF-59). */
  readonly record: (goalId: string) => Promise<void>;
  /** Subtracts the increment from a goal with an amount (RF-60). */
  readonly decrement: (goalId: string) => Promise<void>;
  /** Replaces the total of a goal with an exact amount (RF-60). */
  readonly setAmount: (goalId: string, amount: number) => Promise<void>;
  /** Deletes a goal with what was recorded (RF-57). */
  readonly remove: (goalId: string) => Promise<void>;
}

/** The page of the long-term goals in progress on `day`. */
export function useLongTermGoals(day: LocalDate): LongTermGoalsPage {
  const db = useDatabase();

  const source = useMemo<PageSource<DayLongTermGoal>>(
    () => ({
      idOf: (dayGoal) => dayGoal.goal.id,
      progressOf: ({ goal, value, done }) => ({
        type: goal.type,
        amounts: goal,
        value,
        done,
      }),
      read: async (shownDay) => {
        const [allGoals, entries] = await Promise.all([
          listLongTermGoals(db),
          listLongTermGoalEntries(db),
        ]);
        const dayGoals = longTermGoalsForDay(
          { goals: allGoals, entries },
          shownDay,
        );
        const currentDay = today();
        return {
          items: dayGoals,
          // Like the habits and the weekly goals, a goal counts while it can be edited: until
          // its deadline has passed.
          hasAny: allGoals.some((g) => canEditLongTermGoal(g, currentDay)),
          group: () => groupGoals(dayGoals),
          settle: (order) => settleGoals(dayGoals, order),
          save: async ({ goal }, value) => {
            const existing = entries.find((e) => e.longTermGoalId === goal.id);
            await saveLongTermGoalEntry(db, {
              id: existing?.id ?? newId(),
              longTermGoalId: goal.id,
              value,
            });
          },
        };
      },
    }),
    [db],
  );
  const page = useTrackedPage(source, day);
  const { show, change } = page;

  // Showing a day groups its goals: when it changes and when the screen gains focus, which
  // includes coming back from a form.
  useFocusEffect(useCallback(() => show(day), [show, day]));

  const remove = useCallback(
    (goalId: string) => change(() => deleteLongTermGoal(db, goalId)),
    [db, change],
  );

  return {
    goals: page.items,
    hasAnyGoal: page.hasAny,
    record: page.record,
    decrement: page.decrement,
    setAmount: page.setAmount,
    remove,
  };
}
