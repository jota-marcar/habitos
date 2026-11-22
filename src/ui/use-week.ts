// The goals of the week on screen and how to change them (RF-46, RF-47, RF-50). Like the day
// (`use-day`), it reads the database when the week is shown and after each change, and keeps the
// groups while it stays on screen: only after a pause in the taps do the goals that were
// achieved or undone move to their group.

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteWeeklyGoal,
  listWeeklyGoalEntries,
  listWeeklyGoalVersions,
  listWeeklyGoals,
  saveWeeklyGoal,
  saveWeeklyGoalEntry,
} from "@/data/weekly-goals-repository";
import type { LocalDate } from "@/domain/dates";
import { isDone } from "@/domain/day";
import {
  canRecordOn,
  decremented,
  incremented,
  toggled,
} from "@/domain/entries";
import {
  groupWeekGoals,
  keepGroups,
  settleWeekGoals,
  type DayGroups,
} from "@/domain/order";
import {
  archiveWeeklyGoal,
  goalsForWeek,
  type WeekGoal,
} from "@/domain/weekly-goals";
import { weekOf } from "@/domain/weeks";
import { onSyncedChanges, syncSoon } from "@/sync/app-sync";

import { newId, today } from "./clock";
import { useDatabase } from "./database";
import { playRecorded, recordedFeedback } from "./haptics";
import { SETTLE_DELAY_MS } from "./use-day";

export interface WeekPage {
  /** Its goals in the groups and order of the screen, or null while they are being read. */
  readonly goals: DayGroups<WeekGoal> | null;
  /** Whether there is any goal at all, in this week or not. */
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

const goalIdOf = (weekGoal: WeekGoal) => weekGoal.goal.id;

/** The page of the week that starts on the Monday `monday`. */
export function useWeek(monday: LocalDate): WeekPage {
  const db = useDatabase();
  const [goals, setGoals] = useState<DayGroups<WeekGoal> | null>(null);
  const [hasAnyGoal, setHasAnyGoal] = useState(false);
  // The week on screen, for what happens outside a render.
  const shown = useRef(monday);
  // The groups computed when the week was shown, as goal ids.
  const order = useRef<DayGroups<string> | null>(null);
  // Changes are written one after another, so that quick taps do not overwrite each other.
  const writes = useRef<Promise<void>>(Promise.resolve());
  // Discards the reads that finish after a newer one has started.
  const lastRead = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settleDue = useRef(false);

  const holdSettling = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleDue.current = false;
  }, []);

  const load = useCallback(
    async (week: LocalDate, sort: boolean) => {
      const read = ++lastRead.current;
      const [allGoals, versions, entries] = await Promise.all([
        listWeeklyGoals(db),
        listWeeklyGoalVersions(db),
        listWeeklyGoalEntries(db, week),
      ]);
      if (read !== lastRead.current) return;

      const weekGoals = goalsForWeek(
        { goals: allGoals, versions, entries },
        weekOf(week),
      );
      if (sort || order.current === null) {
        const grouped = groupWeekGoals(weekGoals);
        order.current = {
          pending: grouped.pending.map(goalIdOf),
          done: grouped.done.map(goalIdOf),
        };
        setGoals(grouped);
      } else {
        if (settleDue.current) {
          order.current = settleWeekGoals(weekGoals, order.current);
          settleDue.current = false;
        }
        setGoals(keepGroups(weekGoals, goalIdOf, order.current));
      }
      setHasAnyGoal(allGoals.length > 0);
    },
    [db],
  );

  // Showing a week groups its goals: when it changes and when the screen gains focus, which
  // includes coming back from a form.
  useFocusEffect(
    useCallback(() => {
      holdSettling();
      shown.current = monday;
      void load(monday, true);
    }, [holdSettling, load, monday]),
  );

  // A pending pause does not outlive the screen.
  useEffect(() => holdSettling, [holdSettling]);

  // A synchronization may bring what changed on another device.
  useEffect(
    () => onSyncedChanges(() => void load(shown.current, false)),
    [load],
  );

  // Makes a change after the ones before it and reads the week again, without grouping it.
  const change = useCallback(
    (make: () => Promise<void>): Promise<void> => {
      const write = writes.current.then(async () => {
        await make();
        syncSoon(db);
        await load(shown.current, false);
      });
      // A failed write is reported to the caller but does not block the next ones.
      writes.current = write.catch(() => undefined);
      return write;
    },
    [db, load],
  );

  const setValue = useCallback(
    (
      goalId: string,
      next: (weekGoal: WeekGoal) => number,
      withHaptics = false,
    ): Promise<void> => {
      holdSettling();
      const write = change(async () => {
        if (!canRecordOn(monday, today())) return;
        const [allGoals, versions, entries] = await Promise.all([
          listWeeklyGoals(db),
          listWeeklyGoalVersions(db),
          listWeeklyGoalEntries(db, monday),
        ]);
        const weekGoal = goalsForWeek(
          { goals: allGoals, versions, entries },
          weekOf(monday),
        ).find((g) => g.goal.id === goalId);
        if (weekGoal === undefined) return;

        const value = next(weekGoal);
        if (withHaptics) {
          const { goal, version, done } = weekGoal;
          playRecorded(
            recordedFeedback(done, isDone(goal.type, version, value)),
          );
        }
        const existing = entries.find((e) => e.weeklyGoalId === goalId);
        await saveWeeklyGoalEntry(db, {
          id: existing?.id ?? newId(),
          weeklyGoalId: goalId,
          week: monday,
          value,
        });
      });
      void write.then(() => {
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleDue.current = true;
          void load(shown.current, false);
        }, SETTLE_DELAY_MS);
      }, holdSettling);
      return write;
    },
    [db, monday, change, holdSettling, load],
  );

  const record = useCallback(
    (goalId: string) =>
      setValue(
        goalId,
        ({ goal, version, value }) =>
          goal.type === "boolean"
            ? toggled(value)
            : incremented(value, version.increment ?? 0),
        true,
      ),
    [setValue],
  );

  const decrement = useCallback(
    (goalId: string) =>
      setValue(goalId, ({ version, value }) =>
        decremented(value, version.increment ?? 0),
      ),
    [setValue],
  );

  const setAmount = useCallback(
    (goalId: string, amount: number) => setValue(goalId, () => amount),
    [setValue],
  );

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

  return { goals, hasAnyGoal, record, decrement, setAmount, archive, remove };
}
