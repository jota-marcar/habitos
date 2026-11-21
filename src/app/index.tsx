// The main screen (RF-30), with a page per horizon that the box slides through (RF-33): the
// habits of the day and the goals of the week (RF-40). No header and no fixed buttons: the
// period at the top, the box and, under it, the strip the menu is pulled up from (RF-32).
// In the box of the day, the pending habits sit at the top and the done ones at the bottom, with
// the free space between them (RF-12). A habit that was done or undone slides to its group,
// after a pause in the taps. A tap records a habit (RF-14, RF-15) and holding it down opens its
// options (RF-34).
// The calendar that changes the day is pulled down from the date or from the list (RF-31).

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalDate } from "@/domain/dates";
import { progressOf, type DayHabit } from "@/domain/day";
import { isInWeek, weekOf } from "@/domain/weeks";
import { CalendarSheet } from "@/ui/calendar-sheet";
import { formatDayTitle, formatProgress, formatWeekRange } from "@/ui/format";
import { HabitOptionsSheet } from "@/ui/habit-options-sheet";
import { playOptionsOpened } from "@/ui/haptics";
import { HorizonPager, HorizonTitles, useHorizons } from "@/ui/horizons";
import { PROGRESS_DOT_SIZE, ProgressDot } from "@/ui/progress-dot";
import { Sheet, SheetOption, useOpenSheetGesture, useSheet } from "@/ui/sheet";
import { fontSize, radius, spacing, topGap, useColors } from "@/ui/theme";
import { SETTLE_DELAY_MS, useDay } from "@/ui/use-day";

// A done habit is dimmed (RF-13), gradually during the pause before it moves to its group
// (RF-12). With Reduce Motion on, it changes at once.
const DONE_OPACITY = 0.4;

// How a habit slides to its group, and the others make room for it (RF-12). It is brief, and
// with Reduce Motion on, iOS skips it.
const MOVE = LinearTransition.duration(350).easing(Easing.inOut(Easing.quad));

// The least space between the two groups, when they fill the box and it scrolls (RF-12).
const GROUP_GAP = spacing.xl;

// The strip is thin, but the area that catches the drag is as tall as a button.
const STRIP_TOUCH_HEIGHT = 44;

function HabitRow({
  item,
  showColor,
  onPress,
  onLongPress,
}: {
  item: DayHabit;
  /** Whether the rows of the day have a dot with the color and progress of their habit (RF-13). */
  showColor: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colors = useColors();
  const { habit, version, value, done } = item;
  const boolean = habit.type === "boolean";
  const progress = boolean ? null : formatProgress(value, version);

  const targetOpacity = done ? DONE_OPACITY : 1;
  const opacity = useSharedValue(targetOpacity);
  useEffect(() => {
    opacity.set(withTiming(targetOpacity, { duration: SETTLE_DELAY_MS }));
  }, [opacity, targetOpacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View testID={`fade-${habit.id}`} style={fadeStyle}>
      <Pressable
        testID={`habit-${habit.id}`}
        accessibilityRole={boolean ? "checkbox" : "button"}
        accessibilityState={boolean ? { checked: done } : undefined}
        accessibilityLabel={habit.name}
        accessibilityValue={progress === null ? undefined : { text: progress }}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.label}>
          {/* A habit without a color leaves the room of the dot empty, so that the names line up. */}
          {!showColor ? null : habit.color === null ? (
            <View testID={`no-color-${habit.id}`} style={styles.noDot} />
          ) : (
            <ProgressDot
              testID={`color-dot-${habit.id}`}
              color={colors.habit[habit.color]}
              progress={progressOf(habit.type, version, value)}
            />
          )}
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {habit.name}
          </Text>
        </View>
        {progress === null ? null : (
          <Text style={[styles.progress, { color: colors.textSecondary }]}>
            {progress}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A row of the list, with the line that separates it from the one above unless it is the first
 * of its group. The two groups are in the same container, so that a row that changes group
 * keeps its view and slides from one place to the other.
 */
function MovingHabitRow({
  first,
  ...row
}: Parameters<typeof HabitRow>[0] & { first: boolean }) {
  return (
    <Animated.View layout={MOVE}>
      {first ? null : <Separator />}
      <HabitRow {...row} />
    </Animated.View>
  );
}

function Separator() {
  const colors = useColors();
  return (
    <View style={[styles.separator, { backgroundColor: colors.border }]} />
  );
}

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

function EmptyWeek() {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Todavía no tienes objetivos semanales.
      </Text>
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

  const calendar = useSheet("top");
  const openCalendarFromDate = useOpenSheetGesture(calendar, "day-date");
  // The list only pulls the calendar down when it cannot scroll up any more (RF-31).
  const listAtTop = useSharedValue(true);
  const openCalendarFromList = useOpenSheetGesture(
    calendar,
    "day-list",
    listAtTop,
  );
  const onListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    listAtTop.set(event.nativeEvent.contentOffset.y <= 0);
  // Each day has its own list, which starts at the top.
  useEffect(() => listAtTop.set(true), [date, listAtTop]);

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

  // The dots only appear on a day with some habit that has a color (RF-13).
  const showColor =
    allHabits?.some((item) => item.habit.color !== null) ?? false;

  const openOptions = (item: DayHabit) => {
    playOptionsOpened();
    setHeld(item);
    options.open();
  };

  const renderRow = (item: DayHabit, index: number) => (
    <MovingHabitRow
      key={item.habit.id}
      first={index === 0}
      item={item}
      showColor={showColor}
      onPress={() => void record(item.habit.id)}
      onLongPress={() => openOptions(item)}
    />
  );

  // The form is told the day it was opened from, to say when the changes apply (RF-09).
  const edit = (habitId: string) =>
    router.push({
      pathname: "/habits/[id]/edit",
      params: { id: habitId, day: date },
    });

  const showDay = (chosen: LocalDate) => {
    calendar.close();
    day.select(chosen);
  };

  // A habit created from a future day starts that day (RF-06).
  const create = () => {
    menu.close();
    router.push({ pathname: "/habits/new", params: { day: date } });
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

      <GestureDetector gesture={openCalendarFromList}>
        <View testID="day-list" style={styles.pager}>
          <HorizonPager
            horizons={horizons}
            pages={{
              habits:
                habits === null ? null : allHabits?.length === 0 ? (
                  <EmptyDay hasAnyHabit={hasAnyHabit} isToday={isToday} />
                ) : (
                  <ScrollView
                    key={date}
                    testID="day-habits"
                    // The drag that opens the calendar goes along with the scroll of the list.
                    simultaneousWith={openCalendarFromList}
                    // A list that fits does not move, so pulling it down only brings the calendar.
                    alwaysBounceVertical={false}
                    onScroll={onListScroll}
                    scrollEventThrottle={16}
                    // The list fills the box, and the gap between the groups takes the space
                    // left, which pushes the done group to the bottom.
                    contentContainerStyle={styles.groups}
                  >
                    {/* A single list: with one per group, a row that changes group would be a
                        new view, which appears in its place instead of sliding there. */}
                    {[
                      ...habits.pending.map(renderRow),
                      <View
                        key="gap"
                        testID="day-habits-gap"
                        style={styles.groupGap}
                      />,
                      ...habits.done.map(renderRow),
                    ]}
                  </ScrollView>
                ),
              weekly: <EmptyWeek />,
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
        {/* There is nothing to create on the weekly page until its form exists (RF-32). */}
        {onHabits ? (
          <SheetOption
            icon="plus"
            fallbackIcon="+"
            label="Crear"
            onPress={create}
          />
        ) : null}
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
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - spacing.xs,
  },
  pressed: { opacity: 0.6 },
  label: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm + 2,
  },
  noDot: { height: PROGRESS_DOT_SIZE, width: PROGRESS_DOT_SIZE },
  name: { flexShrink: 1, fontSize: fontSize.list },
  progress: { fontSize: fontSize.list, fontVariant: ["tabular-nums"] },
  groups: { flexGrow: 1 },
  groupGap: { flexGrow: 1, minHeight: GROUP_GAP },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md,
  },
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
