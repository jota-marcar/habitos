// The day view, the only main screen (RF-30). No header and no fixed buttons: the date at the
// top, a box with the habits of the day and, under it, the strip the menu is pulled up from
// (RF-32). A tap records a habit (RF-14, RF-15).

import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DayHabit } from "@/domain/day";
import {
  BottomSheet,
  SheetOption,
  useBottomSheet,
  useOpenSheetGesture,
} from "@/ui/bottom-sheet";
import { today } from "@/ui/clock";
import { formatDayTitle, formatProgress } from "@/ui/format";
import { fontSize, radius, spacing, useColors } from "@/ui/theme";
import { useDay } from "@/ui/use-day";

// A done habit stays in its place, dimmed (RF-13).
const DONE_OPACITY = 0.4;

// The strip is thin, but the area that catches the drag is as tall as a button.
const STRIP_TOUCH_HEIGHT = 44;

function HabitRow({ item, onPress }: { item: DayHabit; onPress: () => void }) {
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

function EmptyDay({ hasAnyHabit }: { hasAnyHabit: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {hasAnyHabit
          ? "Hoy no toca ningún hábito."
          : "Todavía no tienes hábitos."}
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
  const { date, habits, hasAnyHabit, record } = useDay();
  const menu = useBottomSheet();
  const openMenu = useOpenSheetGesture(menu, "menu-strip");

  const create = () => {
    menu.close();
    router.push("/habits/new");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={[styles.date, { color: colors.textSecondary }]}>
        {formatDayTitle(date, today())}
      </Text>

      <View style={[styles.box, { backgroundColor: colors.surface }]}>
        {habits === null ? null : habits.length === 0 ? (
          <EmptyDay hasAnyHabit={hasAnyHabit} />
        ) : (
          <FlatList
            data={habits}
            keyExtractor={(item) => item.habit.id}
            renderItem={({ item }) => (
              <HabitRow
                item={item}
                onPress={() => void record(item.habit.id)}
              />
            )}
            ItemSeparatorComponent={() => (
              <View
                style={[styles.separator, { backgroundColor: colors.border }]}
              />
            )}
          />
        )}
      </View>

      <GestureDetector gesture={openMenu}>
        <View
          testID="menu-strip"
          style={[styles.strip, { marginBottom: insets.bottom + spacing.md }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        </View>
      </GestureDetector>

      <BottomSheet sheet={menu} closeLabel="Cerrar el menú" testID="menu">
        <SheetOption
          icon="plus"
          fallbackIcon="+"
          label="Crear"
          onPress={create}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  date: {
    fontSize: fontSize.body,
    fontWeight: "600",
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md + spacing.md,
  },
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
