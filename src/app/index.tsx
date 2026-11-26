// The main screen (RF-30), with a page per horizon that the box slides through (RF-33): the
// habits of the day, the goals of the week (RF-40) and the long-term goals (RF-58). No header
// and no fixed buttons: the period at the top, the box and, under it, the strip the menu is
// pulled up from (RF-32).
// In each box, what is pending sits at the top and what is done at the bottom (RF-12, RF-46). A
// tap records a habit or a goal (RF-14, RF-15, RF-47, RF-59) and holding it down opens its
// options (RF-34, RF-50, RF-60).
// The calendar that changes the day is pulled down from the date or from the list (RF-31).

import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalDate } from "@/domain/dates";
import type { DayHabit } from "@/domain/day";
import type { DayLongTermGoal } from "@/domain/long-term-goals";
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
import { HabitsPage, LongTermPage, WeeklyPage } from "@/ui/horizon-pages";
import { HorizonPager, HorizonTitles, useHorizons } from "@/ui/horizons";
import { LongTermGoalOptionsSheet } from "@/ui/long-term-goal-options-sheet";
import { Sheet, SheetOption, useOpenSheetGesture, useSheet } from "@/ui/sheet";
import { SyncWarning } from "@/ui/sync-status";
import { radius, spacing, topGap, useColors } from "@/ui/theme";
import { useDay } from "@/ui/use-day";
import { useHeldOptions } from "@/ui/use-held-options";
import { useLongTermGoals } from "@/ui/use-long-term-goals";
import { useWeek } from "@/ui/use-week";
import { WeeklyGoalOptionsSheet } from "@/ui/weekly-goal-options-sheet";

// The strip is thin, but the area that catches the drag is as tall as a button.
const STRIP_TOUCH_HEIGHT = 44;

// The form each page creates its items with (RF-32).
const CREATE_PATHS = {
  habits: "/habits/new",
  weekly: "/weekly-goals/new",
  longTerm: "/long-term-goals/new",
} as const satisfies Record<Horizon, Href>;

const habitIdOf = (dayHabit: DayHabit) => dayHabit.habit.id;
const goalIdOf = (weekGoal: WeekGoal) => weekGoal.goal.id;
const longTermGoalIdOf = (dayGoal: DayLongTermGoal) => dayGoal.goal.id;

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
  // The long-term goals are those in progress on the day on screen (RF-41).
  const longTermPage = useLongTermGoals(date);

  // Tapping a notification opens its page on the current day and week (RF-26, RF-37, RF-49,
  // RF-63). A form that is open stays on top, with what was typed in it. Until the carousel is
  // there, a request waits, because it could not be moved.
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
    longTerm: date,
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
  const longTermGoalOptions = useHeldOptions(
    longTermPage.goals,
    longTermGoalIdOf,
  );

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

  const editLongTermGoal = (goalId: string) =>
    router.push({
      pathname: "/long-term-goals/[id]/edit",
      params: { id: goalId },
    });

  const showDay = (chosen: LocalDate) => {
    calendar.close();
    day.select(chosen);
  };

  // Creates an item of the page on screen (RF-32). Created from a future day or week, it starts
  // then (RF-06, RF-42, RF-55).
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
              longTerm: {
                title: "Metas",
                detail: isToday ? undefined : formatDayTitle(date, today),
                returnHint: isToday ? undefined : "Vuelve a hoy",
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
              habits: (
                <HabitsPage
                  day={date}
                  isToday={isToday}
                  groups={habits}
                  hasAny={hasAnyHabit}
                  onPress={(item) => void record(item.habit.id)}
                  onLongPress={habitOptions.open}
                  simultaneousWith={openCalendarFromList}
                  onScroll={onListScroll("habits")}
                />
              ),
              weekly: (
                <WeeklyPage
                  monday={week.start}
                  isThisWeek={isThisWeek}
                  groups={goals}
                  hasAny={weekPage.hasAnyGoal}
                  onPress={(item) => void weekPage.record(item.goal.id)}
                  onLongPress={goalOptions.open}
                  simultaneousWith={openCalendarFromList}
                  onScroll={onListScroll("weekly")}
                />
              ),
              longTerm: (
                <LongTermPage
                  day={date}
                  isToday={isToday}
                  groups={longTermPage.goals}
                  hasAny={longTermPage.hasAnyGoal}
                  onPress={(item) => void longTermPage.record(item.goal.id)}
                  onLongPress={longTermGoalOptions.open}
                  simultaneousWith={openCalendarFromList}
                  onScroll={onListScroll("longTerm")}
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

      <LongTermGoalOptionsSheet
        sheet={longTermGoalOptions.sheet}
        dayGoal={longTermGoalOptions.held}
        day={date}
        today={today}
        page={longTermPage}
        onEdit={editLongTermGoal}
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
  strip: {
    alignItems: "center",
    height: STRIP_TOUCH_HEIGHT,
    paddingTop: spacing.sm,
  },
  grabber: { borderRadius: radius.round, height: 5, width: 36 },
});
