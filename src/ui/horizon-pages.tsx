// What each page of the main screen shows in its box (RF-33): the habits of a day (RF-12), the
// goals of a week (RF-46) or the long-term goals in progress (RF-58), or, while it has none, what
// to do about it (RF-40, RF-58).

import { StyleSheet, Text, View } from "react-native";

import type { LocalDate } from "@/domain/dates";
import type { DayHabit } from "@/domain/day";
import {
  daysLeft,
  paceOf,
  type DayLongTermGoal,
} from "@/domain/long-term-goals";
import type { DayGroups } from "@/domain/order";
import type { WeekGoal } from "@/domain/weekly-goals";

import { formatDaysLeft, formatPace } from "@/shared/format";
import { fontSize, spacing, useColors } from "./theme";
import {
  TrackedList,
  type ListScrollProps,
  type TrackedItem,
} from "./tracked-list";

/** What every page needs to show its list and to share the gestures of the screen. */
type PageProps<T> = ListScrollProps & {
  /** The items in their groups, or null while they are being read. */
  readonly groups: DayGroups<T> | null;
  /** Whether there is anything at all, in this period or not. */
  readonly hasAny: boolean;
  readonly onPress: (entry: T) => void;
  readonly onLongPress: (entry: T) => void;
};

const habitItem = ({ habit, version, value, done }: DayHabit): TrackedItem => ({
  id: habit.id,
  name: habit.name,
  type: habit.type,
  color: habit.color,
  amounts: version,
  value,
  done,
});

const weekGoalItem = ({
  goal,
  version,
  value,
  done,
}: WeekGoal): TrackedItem => ({
  id: goal.id,
  name: goal.name,
  type: goal.type,
  color: goal.color,
  amounts: version,
  value,
  done,
});

// A pending goal says what is left until its deadline from the day on screen (RF-58) and, on
// the current day, how it is going against its pace (RF-62). On another day it could not: the
// total has no day, so what had been recorded by then is not known.
const longTermGoalItem =
  (day: LocalDate, isToday: boolean) =>
  ({ goal, value, done }: DayLongTermGoal): TrackedItem => {
    const pace = isToday ? paceOf(goal, value, day) : null;
    const left = formatDaysLeft(daysLeft(goal.deadline, day));
    return {
      id: goal.id,
      name: goal.name,
      type: goal.type,
      color: goal.color,
      amounts: goal,
      value,
      done,
      detail: done
        ? undefined
        : pace === null
          ? left
          : `${left} · ${formatPace(pace, goal.unit)}`,
    };
  };

const isEmpty = <T,>(groups: DayGroups<T>) =>
  groups.pending.length === 0 && groups.done.length === 0;

/** What a page says while it has nothing to show, and how to create something if it never had. */
function EmptyPage({ title, hint }: { title: string; hint?: string }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {hint === undefined ? null : (
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export function HabitsPage({
  day,
  isToday,
  groups,
  hasAny,
  ...list
}: PageProps<DayHabit> & { day: LocalDate; isToday: boolean }) {
  if (groups === null) return null;
  if (isEmpty(groups)) {
    return (
      <EmptyPage
        title={
          !hasAny
            ? "Todavía no tienes hábitos."
            : isToday
              ? "Hoy no toca ningún hábito."
              : "Este día no toca ningún hábito."
        }
        hint={
          hasAny
            ? undefined
            : "Desliza desde abajo para crear uno y desde arriba para abrir el calendario."
        }
      />
    );
  }
  return (
    <TrackedList
      key={day}
      testID="day-habits"
      rowPrefix="habit"
      groups={groups}
      itemOf={habitItem}
      {...list}
    />
  );
}

export function WeeklyPage({
  monday,
  isThisWeek,
  groups,
  hasAny,
  ...list
}: PageProps<WeekGoal> & { monday: LocalDate; isThisWeek: boolean }) {
  if (groups === null) return null;
  if (isEmpty(groups)) {
    return (
      <EmptyPage
        title={
          !hasAny
            ? "Todavía no tienes objetivos semanales."
            : isThisWeek
              ? "Esta semana no hay objetivos."
              : "Esa semana no hay objetivos."
        }
        hint={hasAny ? undefined : "Desliza desde abajo para crear uno."}
      />
    );
  }
  return (
    <TrackedList
      key={monday}
      testID="week-goals"
      rowPrefix="goal"
      groups={groups}
      itemOf={weekGoalItem}
      {...list}
    />
  );
}

export function LongTermPage({
  day,
  isToday,
  groups,
  hasAny,
  ...list
}: PageProps<DayLongTermGoal> & { day: LocalDate; isToday: boolean }) {
  if (groups === null) return null;
  if (isEmpty(groups)) {
    return (
      <EmptyPage
        title={
          !hasAny
            ? "Todavía no tienes metas."
            : isToday
              ? "Hoy no hay ninguna meta en curso."
              : "Ese día no hay ninguna meta en curso."
        }
        hint={hasAny ? undefined : "Desliza desde abajo para crear una."}
      />
    );
  }
  return (
    <TrackedList
      key={day}
      testID="long-term-goals"
      rowPrefix="long-term-goal"
      groups={groups}
      itemOf={longTermGoalItem(day, isToday)}
      {...list}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.body, textAlign: "center" },
  emptyHint: { fontSize: fontSize.caption, textAlign: "center" },
});
