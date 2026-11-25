// The main screen (RF-30), with a page per horizon that the box slides through (RF-33): the
// habits of the day and the goals of the week (RF-40). No header and no fixed buttons: the
// period at the top, the box and, under it, the strip the menu is pulled up from (RF-32).
// In each box, what is pending sits at the top and what is done at the bottom (RF-12, RF-46). A
// tap records a habit or a goal (RF-14, RF-15, RF-47) and holding it down opens its options
// (RF-34, RF-50).
// The calendar that changes the day is pulled down from the date or from the list (RF-31).

import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalDate } from "@/domain/dates";
import type { DayHabit } from "@/domain/day";
import type { WeekGoal } from "@/domain/weekly-goals";
import { isInWeek, weekOf } from "@/domain/weeks";
import { CalendarSheet } from "@/ui/calendar-sheet";
import { today as currentDay } from "@/shared/clock";
import { formatDayTitle, formatWeekRange } from "@/shared/format";
import { HabitOptionsSheet } from "@/ui/habit-options-sheet";
import {
  HORIZONS,
  listenToHorizonRequests,
  type Horizon,
} from "@/shared/horizon-request";
import { HorizonPager, HorizonTitles, useHorizons } from "@/ui/horizons";
import { Sheet, SheetOption, useOpenSheetGesture, useSheet } from "@/ui/sheet";
import { SyncWarning } from "@/ui/sync-status";
import { fontSize, radius, spacing, topGap, useColors } from "@/ui/theme";
import { TrackedList, type TrackedItem } from "@/ui/tracked-list";
import { useDay } from "@/ui/use-day";
import { useHeldOptions } from "@/ui/use-held-options";
import { useWeek } from "@/ui/use-week";
import { WeeklyGoalOptionsSheet } from "@/ui/weekly-goal-options-sheet";

// The strip is thin, but the area that catches the drag is as tall as a button.
const STRIP_TOUCH_HEIGHT = 44;

const habitItem = ({ habit, version, value, done }: DayHabit): TrackedItem => ({
  id: habit.id,
  name: habit.name,
  type: habit.type,
  color: habit.color,
  amounts: version,
  value,
  done,
});

const goalItem = ({ goal, version, value, done }: WeekGoal): TrackedItem => ({
  id: goal.id,
  name: goal.name,
  type: goal.type,
  color: goal.color,
  amounts: version,
  value,
  done,
});

// The form each page creates its items with (RF-32).
const CREATE_PATHS = {
  habits: "/habits/new",
  weekly: "/weekly-goals/new",
} as const satisfies Record<Horizon, Href>;

const habitIdOf = (dayHabit: DayHabit) => dayHabit.habit.id;
const goalIdOf = (weekGoal: WeekGoal) => weekGoal.goal.id;

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

export default function Today() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const day = useDay();
  const { date, today, habits, hasAnyHabit, record } = day;
  const isToday = date === today;
  const horizons = useHorizons();
  // The week on screen is the one of the day on screen (RF-41).
  const week = weekOf(date);
  const isThisWeek = isInWeek(today, week);
  const weekRange = formatWeekRange(week, today);
  const weekPage = useWeek(week.start);

  // Tapping a notification opens its page on the current day and week (RF-26, RF-37, RF-49). A
  // form that is open stays on top, with what was typed in it. Until the carousel is there, a
  // request waits, because it could not be moved.
  const { ready: pagerReady, show: showHorizon } = horizons;
  const { select: selectDay } = day;
  useEffect(() => {
    if (!pagerReady) return;
    return listenToHorizonRequests((horizon) => {
      showHorizon(horizon);
      selectDay(currentDay());
    });
  }, [pagerReady, showHorizon, selectDay]);

  const calendar = useSheet("top");
  const openCalendarFromDate = useOpenSheetGesture(calendar, "day-date");
  // The list only pulls the calendar down when it cannot scroll up any more (RF-31).
  const listAtTop = useSharedValue(true);
  const openCalendarFromList = useOpenSheetGesture(
    calendar,
    "day-list",
    listAtTop,
  );
  // Each page has its own list, and what counts is the one on screen.
  const listOffsets = useRef(
    Object.fromEntries(HORIZONS.map((h) => [h, 0])) as Record<Horizon, number>,
  );
  const onListScroll =
    (horizon: Horizon) => (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      listOffsets.current[horizon] = offset;
      if (horizon === horizons.horizon) listAtTop.set(offset <= 0);
    };
  // Each page shows the list of a period, which starts at the top when the period changes.
  const listPeriods: Record<Horizon, LocalDate> = {
    habits: date,
    weekly: week.start,
  };
  const shownPeriods = useRef(listPeriods);
  useEffect(() => {
    for (const horizon of HORIZONS) {
      if (shownPeriods.current[horizon] !== listPeriods[horizon]) {
        listOffsets.current[horizon] = 0;
      }
    }
    shownPeriods.current = listPeriods;
    listAtTop.set(listOffsets.current[horizons.horizon] <= 0);
  });

  const menu = useSheet();
  const openMenu = useOpenSheetGesture(menu, "menu-strip");
  const habitOptions = useHeldOptions(habits, habitIdOf);
  const goals = weekPage.goals;
  const goalOptions = useHeldOptions(goals, goalIdOf);
  const isEmpty = <T,>(groups: { pending: readonly T[]; done: readonly T[] }) =>
    groups.pending.length === 0 && groups.done.length === 0;

  // The form is told the day it was opened from, to say when the changes apply (RF-09).
  const edit = (habitId: string) =>
    router.push({
      pathname: "/habits/[id]/edit",
      params: { id: habitId, day: date },
    });

  const editGoal = (goalId: string) =>
    router.push({
      pathname: "/weekly-goals/[id]/edit",
      params: { id: goalId, day: date },
    });

  const showDay = (chosen: LocalDate) => {
    calendar.close();
    day.select(chosen);
  };

  // Creates an item of the page on screen (RF-32). Created from a future day or week, it starts
  // then (RF-06, RF-42).
  const create = () => {
    menu.close();
    router.push({
      pathname: CREATE_PATHS[horizons.horizon],
      params: { day: date },
    });
  };

  const openSettings = () => {
    menu.close();
    router.push("/settings");
  };

  return (
    <View style={styles.screen}>
      {/* The whole top of the screen pulls the calendar down, not only the text. */}
      <GestureDetector gesture={openCalendarFromDate}>
        <View
          testID="day-date"
          style={[styles.dateArea, { paddingTop: insets.top + topGap }]}
        >
          {/* Touching the title of another period goes back to the current one (RF-21, RF-41). */}
          <HorizonTitles
            horizons={horizons}
            titles={{
              habits: {
                title: formatDayTitle(date, today),
                returnHint: isToday ? undefined : "Vuelve a hoy",
                onReturn: () => showDay(today),
              },
              weekly: {
                title: isThisWeek ? "Esta semana" : weekRange,
                detail: isThisWeek ? weekRange : undefined,
                returnHint: isThisWeek ? undefined : "Vuelve a esta semana",
                onReturn: () => showDay(today),
              },
            }}
          />
        </View>
      </GestureDetector>

      <SyncWarning />

      <GestureDetector gesture={openCalendarFromList}>
        <View testID="day-list" style={styles.pager}>
          <HorizonPager
            horizons={horizons}
            pages={{
              habits:
                habits === null ? null : isEmpty(habits) ? (
                  <EmptyPage
                    title={
                      !hasAnyHabit
                        ? "Todavía no tienes hábitos."
                        : isToday
                          ? "Hoy no toca ningún hábito."
                          : "Este día no toca ningún hábito."
                    }
                    hint={
                      hasAnyHabit
                        ? undefined
                        : "Desliza desde abajo para crear uno y desde arriba para abrir el calendario."
                    }
                  />
                ) : (
                  <TrackedList
                    key={date}
                    testID="day-habits"
                    rowPrefix="habit"
                    groups={habits}
                    itemOf={habitItem}
                    onPress={(item) => void record(item.habit.id)}
                    onLongPress={habitOptions.open}
                    simultaneousWith={openCalendarFromList}
                    onScroll={onListScroll("habits")}
                  />
                ),
              weekly:
                goals === null ? null : isEmpty(goals) ? (
                  <EmptyPage
                    title={
                      !weekPage.hasAnyGoal
                        ? "Todavía no tienes objetivos semanales."
                        : isThisWeek
                          ? "Esta semana no hay objetivos."
                          : "Esa semana no hay objetivos."
                    }
                    hint={
                      weekPage.hasAnyGoal
                        ? undefined
                        : "Desliza desde abajo para crear uno."
                    }
                  />
                ) : (
                  <TrackedList
                    key={week.start}
                    testID="week-goals"
                    rowPrefix="goal"
                    groups={goals}
                    itemOf={goalItem}
                    onPress={(item) => void weekPage.record(item.goal.id)}
                    onLongPress={goalOptions.open}
                    simultaneousWith={openCalendarFromList}
                    onScroll={onListScroll("weekly")}
                  />
                ),
            }}
          />
        </View>
      </GestureDetector>

      <GestureDetector gesture={openMenu}>
        <View
          testID="menu-strip"
          style={[styles.strip, { marginBottom: insets.bottom + spacing.md }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        </View>
      </GestureDetector>

      <CalendarSheet
        sheet={calendar}
        date={date}
        today={today}
        // The weekly page shows a whole week, and the calendar marks it (RF-41).
        wholeWeek={horizons.horizon === "weekly"}
        onSelect={showDay}
      />

      <Sheet sheet={menu} closeLabel="Cerrar el menú" testID="menu">
        <SheetOption
          icon="plus"
          fallbackIcon="+"
          label="Crear"
          onPress={create}
        />
        <SheetOption
          icon="gearshape"
          fallbackIcon="⚙"
          label="Ajustes"
          onPress={openSettings}
        />
      </Sheet>

      <HabitOptionsSheet
        sheet={habitOptions.sheet}
        dayHabit={habitOptions.held}
        day={day}
        onEdit={edit}
      />

      <WeeklyGoalOptionsSheet
        sheet={goalOptions.sheet}
        weekGoal={goalOptions.held}
        week={week}
        today={today}
        page={weekPage}
        onEdit={editGoal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  dateArea: {
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md + spacing.md,
  },
  pager: { flex: 1 },
  empty: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.body, textAlign: "center" },
  emptyHint: { fontSize: fontSize.caption, textAlign: "center" },
  strip: {
    alignItems: "center",
    height: STRIP_TOUCH_HEIGHT,
    paddingTop: spacing.sm,
  },
  grabber: { borderRadius: radius.round, height: 5, width: 36 },
});
