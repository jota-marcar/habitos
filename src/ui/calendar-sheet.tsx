// The calendar that changes the day on screen (RF-18), in a sheet that is pulled down from the
// top (RF-31): a month in a grid, under its name and the initials of the weekdays. Dragging it
// sideways changes the month, and tapping a day chooses it.

import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { monthAt, monthIndex, monthOf, monthWeeks } from "@/domain/calendar";
import type { LocalDate, Weekday } from "@/domain/dates";
import { isInWeek, weekOf } from "@/domain/weeks";

import { WEEKDAY_INITIALS, formatFullDate, formatMonthTitle } from "./format";
import { Sheet, type SheetState } from "./sheet";
import { ACTIVATION_DISTANCE, SPRING, monthStep } from "./sheet-motion";
import { fontSize, radius, spacing, useColors } from "./theme";

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// A month takes from four to six weeks. The grid always leaves room for six, so that the
// sheet does not change its height from one month to another.
const MAX_WEEKS = 6;
const CELL_HEIGHT = 44;
const DAY_SIZE = 36;

function MonthGrid({
  index,
  date,
  today,
  wholeWeek,
  onSelect,
}: {
  index: number;
  date: LocalDate;
  today: LocalDate;
  wholeWeek: boolean;
  onSelect: (date: LocalDate) => void;
}) {
  const colors = useColors();
  const shownWeek = weekOf(date);
  return (
    <View>
      {monthWeeks(monthAt(index)).map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((day, column) => {
            if (day === null) return <View key={column} style={styles.cell} />;
            const inShownWeek = wholeWeek && isInWeek(day, shownWeek);
            const selected = wholeWeek ? inShownWeek : day === date;
            const isToday = day === today;
            // The band of the week is rounded where it ends, also at the edge of the month.
            const startsBand = column === 0 || week[column - 1] === null;
            const endsBand = column === 6 || week[column + 1] === null;
            return (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityLabel={
                  isToday ? `Hoy, ${formatFullDate(day)}` : formatFullDate(day)
                }
                accessibilityState={{ selected }}
                onPress={() => onSelect(day)}
                style={styles.cell}
              >
                {inShownWeek ? (
                  <View
                    testID={`week-band-${day}`}
                    style={[
                      styles.weekBand,
                      { backgroundColor: colors.primary },
                      startsBand && styles.weekBandStart,
                      endsBand && styles.weekBandEnd,
                    ]}
                  />
                ) : null}
                {/* The day on screen is a filled circle; the current day, the color of it. */}
                <View
                  style={[
                    styles.day,
                    selected &&
                      !wholeWeek && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: colors.text },
                      isToday && [styles.today, { color: colors.primary }],
                      selected && { color: colors.onPrimary },
                    ]}
                  >
                    {Number(day.slice(8))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function CalendarSheet({
  sheet,
  date,
  today,
  wholeWeek = false,
  onSelect,
}: {
  sheet: SheetState;
  /** The day on screen. */
  date: LocalDate;
  today: LocalDate;
  /** Whether what is on screen is the week of that day, which is then marked whole (RF-41). */
  wholeWeek?: boolean;
  onSelect: (date: LocalDate) => void;
}) {
  const colors = useColors();

  // Months are handled by their position among all months (see `monthIndex`). While it is
  // closed, the calendar waits in the month of the day on screen; once open, it can be moved.
  const home = monthIndex(monthOf(date));
  const [shownMonth, setShownMonth] = useState(home);
  if (!sheet.isOpen && shownMonth !== home) setShownMonth(home);

  // The months are laid out side by side, each at the place of its index, and the row slides
  // to the one at `position`. Their places are counted from the first month shown, to keep
  // the numbers small.
  const [origin] = useState(home);
  const position = useSharedValue(home);
  const width = useSharedValue(0);
  const dragStart = useSharedValue(home);

  useEffect(() => {
    position.set(withSpring(shownMonth, SPRING));
  }, [position, shownMonth]);

  const onLayout = (event: LayoutChangeEvent) => {
    width.set(event.nativeEvent.layout.width);
  };

  // Sideways drags change the month; the vertical ones are left to the sheet, which closes.
  const changeMonth = usePanGesture({
    testID: "calendar-months",
    activeOffsetX: [-ACTIVATION_DISTANCE, ACTIVATION_DISTANCE],
    failOffsetY: [-ACTIVATION_DISTANCE, ACTIVATION_DISTANCE],
    onActivate: () => {
      "worklet";
      dragStart.set(Math.round(position.get()));
    },
    onUpdate: (event) => {
      "worklet";
      const w = width.get();
      if (w <= 0) return;
      // The neighbouring months are the only ones drawn: the drag never goes past them.
      const travel = Math.max(-1, Math.min(1, -event.translationX / w));
      position.set(dragStart.get() + travel);
    },
    onDeactivate: (event) => {
      "worklet";
      const w = width.get();
      const step = event.canceled
        ? 0
        : monthStep(event.translationX, event.velocityX, w);
      const target = dragStart.get() + step;
      position.set(
        withSpring(target, {
          ...SPRING,
          velocity: w > 0 ? -event.velocityX / w : 0,
        }),
      );
      if (step !== 0) scheduleOnRN(setShownMonth, target);
    },
  });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(position.get() - origin) * width.get() }],
  }));

  return (
    <Sheet sheet={sheet} closeLabel="Cerrar el calendario" testID="calendar">
      <Text
        accessibilityRole="header"
        style={[styles.month, { color: colors.text }]}
      >
        {formatMonthTitle(monthAt(shownMonth))}
      </Text>
      <View style={styles.week}>
        {WEEKDAYS.map((weekday) => (
          <Text
            key={weekday}
            style={[styles.weekday, { color: colors.textSecondary }]}
          >
            {WEEKDAY_INITIALS[weekday]}
          </Text>
        ))}
      </View>
      <GestureDetector gesture={changeMonth}>
        <View
          testID="calendar-months-box"
          style={styles.months}
          onLayout={onLayout}
        >
          <Animated.View style={[StyleSheet.absoluteFill, rowStyle]}>
            {[shownMonth - 1, shownMonth, shownMonth + 1].map((index) => (
              <View
                key={index}
                // Only the month in the middle can be reached; the others are seen in passing.
                pointerEvents={index === shownMonth ? "auto" : "none"}
                accessibilityElementsHidden={index !== shownMonth}
                importantForAccessibility={
                  index === shownMonth ? "auto" : "no-hide-descendants"
                }
                style={[styles.page, { left: `${(index - origin) * 100}%` }]}
              >
                <MonthGrid
                  index={index}
                  date={date}
                  today={today}
                  wholeWeek={wholeWeek}
                  onSelect={onSelect}
                />
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The month is as far from the top of the sheet as from its sides.
  month: {
    fontSize: fontSize.body,
    fontWeight: "600",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  week: { flexDirection: "row" },
  weekday: {
    flex: 1,
    fontSize: fontSize.caption,
    paddingBottom: spacing.xs,
    textAlign: "center",
  },
  months: { height: MAX_WEEKS * CELL_HEIGHT, overflow: "hidden" },
  page: { bottom: 0, position: "absolute", top: 0, width: "100%" },
  cell: {
    alignItems: "center",
    flex: 1,
    height: CELL_HEIGHT,
    justifyContent: "center",
  },
  day: {
    alignItems: "center",
    borderRadius: radius.round,
    height: DAY_SIZE,
    justifyContent: "center",
    width: DAY_SIZE,
  },
  weekBand: {
    height: DAY_SIZE,
    left: 0,
    position: "absolute",
    right: 0,
    top: (CELL_HEIGHT - DAY_SIZE) / 2,
  },
  weekBandStart: {
    borderBottomLeftRadius: DAY_SIZE / 2,
    borderTopLeftRadius: DAY_SIZE / 2,
  },
  weekBandEnd: {
    borderBottomRightRadius: DAY_SIZE / 2,
    borderTopRightRadius: DAY_SIZE / 2,
  },
  dayNumber: { fontSize: fontSize.body, fontVariant: ["tabular-nums"] },
  today: { fontWeight: "600" },
});
