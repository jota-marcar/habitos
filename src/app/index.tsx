// The day view, the only main screen (RF-30). No header and no fixed buttons: the date at the
// top, a box with the habits of the day and, under it, the strip the menu is pulled up from
// (RF-32). In the box, the pending habits sit at the top and the done ones at the bottom, with
// the free space between them (RF-12). A tap records a habit (RF-14, RF-15) and holding it down opens its options (RF-34).
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
import { FlatList, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalDate } from "@/domain/dates";
import type { DayHabit } from "@/domain/day";
import { CalendarSheet } from "@/ui/calendar-sheet";
import { formatDayTitle, formatProgress } from "@/ui/format";
import { HabitOptionsSheet } from "@/ui/habit-options-sheet";
import { Sheet, SheetOption, useOpenSheetGesture, useSheet } from "@/ui/sheet";
import { fontSize, radius, spacing, topGap, useColors } from "@/ui/theme";
import { useDay } from "@/ui/use-day";

// A done habit stays in its place, dimmed (RF-13).
const DONE_OPACITY = 0.4;

// The least space between the two groups, when they fill the box and it scrolls (RF-12).
const GROUP_GAP = spacing.xl;

// The strip is thin, but the area that catches the drag is as tall as a button.
const STRIP_TOUCH_HEIGHT = 44;

function HabitRow({
  item,
  onPress,
  onLongPress,
}: {
  item: DayHabit;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colors = useColors();
  const { habit, version, value, done } = item;
  const boolean = habit.type === "boolean";
  const progress = boolean ? null : formatProgress(value, version);

  return (
    <Pressable
      testID={`habit-${habit.id}`}
      accessibilityRole={boolean ? "checkbox" : "button"}
      accessibilityState={boolean ? { checked: done } : undefined}
      accessibilityLabel={habit.name}
      accessibilityValue={progress === null ? undefined : { text: progress }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        done && styles.done,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
        {habit.name}
      </Text>
      {progress === null ? null : (
        <Text style={[styles.progress, { color: colors.textSecondary }]}>
          {progress}
        </Text>
      )}
    </Pressable>
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
          Desliza hacia arriba desde la franja de abajo para crear uno.
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

  const openOptions = (item: DayHabit) => {
    setHeld(item);
    options.open();
  };

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

  const create = () => {
    menu.close();
    router.push("/habits/new");
  };

  return (
    <View style={styles.screen}>
      {/* The whole top of the screen pulls the calendar down, not only the text. */}
      <GestureDetector gesture={openCalendarFromDate}>
        <View
          testID="day-date"
          style={[styles.dateArea, { paddingTop: insets.top + topGap }]}
        >
          {/* Touching the date of another day goes back to the current one (RF-21). */}
          <Pressable
            accessibilityRole={isToday ? "text" : "button"}
            accessibilityHint={isToday ? undefined : "Vuelve a hoy"}
            disabled={isToday}
            hitSlop={spacing.sm}
            onPress={() => showDay(today)}
          >
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {formatDayTitle(date, today)}
            </Text>
          </Pressable>
        </View>
      </GestureDetector>

      <GestureDetector gesture={openCalendarFromList}>
        <View
          testID="day-list"
          style={[styles.box, { backgroundColor: colors.surface }]}
        >
          {habits === null ? null : allHabits?.length === 0 ? (
            <EmptyDay hasAnyHabit={hasAnyHabit} isToday={isToday} />
          ) : (
            <FlatList
              key={date}
              testID="day-habits"
              data={habits.pending}
              // The drag that opens the calendar goes along with the scroll of the list.
              simultaneousWith={openCalendarFromList}
              // A list that fits does not move, so pulling it down only brings the calendar.
              alwaysBounceVertical={false}
              onScroll={onListScroll}
              scrollEventThrottle={16}
              keyExtractor={(item) => item.habit.id}
              renderItem={({ item }) => (
                <HabitRow
                  item={item}
                  onPress={() => void record(item.habit.id)}
                  onLongPress={() => openOptions(item)}
                />
              )}
              ItemSeparatorComponent={Separator}
              // The list fills the box, and the done group takes the space left under the
              // pending one, pushed to the bottom.
              contentContainerStyle={styles.groups}
              ListFooterComponentStyle={styles.doneGroup}
              ListFooterComponent={
                habits.done.length === 0 ? undefined : (
                  <View testID="day-habits-done">
                    {habits.done.map((item, index) => (
                      <View key={item.habit.id}>
                        {index === 0 ? null : <Separator />}
                        <HabitRow
                          item={item}
                          onPress={() => void record(item.habit.id)}
                          onLongPress={() => openOptions(item)}
                        />
                      </View>
                    ))}
                  </View>
                )
              }
            />
          )}
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
        onSelect={showDay}
      />

      <Sheet sheet={menu} closeLabel="Cerrar el menú" testID="menu">
        <SheetOption
          icon="plus"
          fallbackIcon="+"
          label="Crear"
          onPress={create}
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
  date: { fontSize: fontSize.heading, fontWeight: "600" },
  box: {
    borderRadius: radius.md,
    flex: 1,
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - spacing.xs,
  },
  done: { opacity: DONE_OPACITY },
  pressed: { opacity: 0.6 },
  name: { flexShrink: 1, fontSize: fontSize.body },
  progress: { fontSize: fontSize.body, fontVariant: ["tabular-nums"] },
  groups: { flexGrow: 1 },
  doneGroup: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingTop: GROUP_GAP,
  },
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
