// The main screen (RF-30), with a page per horizon that the box slides through (RF-33): the
// habits of the day and the goals of the week (RF-40). No header and no fixed buttons: the
// period at the top, the box and, under it, the strip the menu is pulled up from (RF-32).
// In each box, what is pending sits at the top and what is done at the bottom (RF-12, RF-46). A
// tap records a habit or a goal (RF-14, RF-15, RF-47) and holding it down opens its options
// (RF-34, RF-50).
// The calendar that changes the day is pulled down from the date or from the list (RF-31).

import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { today as currentDay } from "@/ui/clock";
import { formatDayTitle, formatWeekRange } from "@/ui/format";
import { HabitOptionsSheet } from "@/ui/habit-options-sheet";
import { playOptionsOpened } from "@/ui/haptics";
import { listenToHorizonRequests } from "@/ui/horizon-request";
import {
  HorizonPager,
  HorizonTitles,
  useHorizons,
  type Horizon,
} from "@/ui/horizons";
import { Sheet, SheetOption, useOpenSheetGesture, useSheet } from "@/ui/sheet";
import { SyncWarning } from "@/ui/sync-status";
import { fontSize, radius, spacing, topGap, useColors } from "@/ui/theme";
import { TrackedList, type TrackedItem } from "@/ui/tracked-list";
import { useDay } from "@/ui/use-day";
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

function EmptyDay({
  hasAnyHabit,
  isToday,
}: {
  hasAnyHabit: boolean;
  isToday: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {!hasAnyHabit
          ? "Todavía no tienes hábitos."
          : isToday
            ? "Hoy no toca ningún hábito."
            : "Este día no toca ningún hábito."}
      </Text>
      {hasAnyHabit ? null : (
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          Desliza desde abajo para crear uno y desde arriba para abrir el
          calendario.
        </Text>
      )}
    </View>
  );
}

function EmptyWeek({
  hasAnyGoal,
  isThisWeek,
}: {
  hasAnyGoal: boolean;
  isThisWeek: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {!hasAnyGoal
          ? "Todavía no tienes objetivos semanales."
          : isThisWeek
            ? "Esta semana no hay objetivos."
            : "Esa semana no hay objetivos."}
      </Text>
      {hasAnyGoal ? null : (
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          Desliza desde abajo para crear uno.
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
  const onHabits = horizons.horizon === "habits";
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
  const listOffsets = useRef<Record<Horizon, number>>({ habits: 0, weekly: 0 });
  const onListScroll =
    (horizon: Horizon) => (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      listOffsets.current[horizon] = offset;
      if (horizon === horizons.horizon) listAtTop.set(offset <= 0);
    };
  // Each day and each week have their own list, which starts at the top.
  useEffect(() => {
    listOffsets.current.habits = 0;
  }, [date]);
  useEffect(() => {
    listOffsets.current.weekly = 0;
  }, [week.start]);
  useEffect(
    () => listAtTop.set(listOffsets.current[horizons.horizon] <= 0),
    [date, week.start, horizons.horizon, listAtTop],
  );

  const menu = useSheet();
  const openMenu = useOpenSheetGesture(menu, "menu-strip");
  const options = useSheet();
  // The habit whose options were opened. Its row gives how it is now; what it was like when
  // it was held down is kept for when it is no longer on the day, while the sheet closes.
  const [held, setHeld] = useState<DayHabit | null>(null);
  const allHabits =
    habits === null ? null : [...habits.pending, ...habits.done];
  const heldNow =
    allHabits?.find((item) => item.habit.id === held?.habit.id) ?? held;

  const goalOptions = useSheet();
  // The same for the goal whose options were opened.
  const [heldGoal, setHeldGoal] = useState<WeekGoal | null>(null);
  const goals = weekPage.goals;
  const allGoals = goals === null ? null : [...goals.pending, ...goals.done];
  const heldGoalNow =
    allGoals?.find((item) => item.goal.id === heldGoal?.goal.id) ?? heldGoal;

  const openOptions = (item: DayHabit) => {
    playOptionsOpened();
    setHeld(item);
    options.open();
  };

  const openGoalOptions = (item: WeekGoal) => {
    playOptionsOpened();
    setHeldGoal(item);
    goalOptions.open();
  };

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
      pathname: onHabits ? "/habits/new" : "/weekly-goals/new",
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
                habits === null ? null : allHabits?.length === 0 ? (
                  <EmptyDay hasAnyHabit={hasAnyHabit} isToday={isToday} />
                ) : (
                  <TrackedList
                    key={date}
                    testID="day-habits"
                    rowPrefix="habit"
                    groups={habits}
                    itemOf={habitItem}
                    onPress={(item) => void record(item.habit.id)}
                    onLongPress={openOptions}
                    simultaneousWith={openCalendarFromList}
                    onScroll={onListScroll("habits")}
                  />
                ),
              weekly:
                goals === null ? null : allGoals?.length === 0 ? (
                  <EmptyWeek
                    hasAnyGoal={weekPage.hasAnyGoal}
                    isThisWeek={isThisWeek}
                  />
                ) : (
                  <TrackedList
                    key={week.start}
                    testID="week-goals"
                    rowPrefix="goal"
                    groups={goals}
                    itemOf={goalItem}
                    onPress={(item) => void weekPage.record(item.goal.id)}
                    onLongPress={openGoalOptions}
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
        wholeWeek={!onHabits}
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
        sheet={options}
        dayHabit={heldNow}
        day={day}
        onEdit={edit}
      />

      <WeeklyGoalOptionsSheet
        sheet={goalOptions}
        weekGoal={heldGoalNow}
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
